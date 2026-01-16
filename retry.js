// retry_failed_mtprovince.js - Retry only failed pages for Mountain Province
const puppeteer = require('puppeteer');
const fs = require('fs');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryFailedPages() {
    console.log('===========================================');
    console.log('Mountain Province - Retry Failed Pages');
    console.log('===========================================\n');
    
    // Load failed pages
    if (!fs.existsSync('failed_pages.txt')) {
        console.log('❌ No failed_pages.txt file found!');
        return;
    }
    
    const failedPagesContent = fs.readFileSync('failed_pages.txt', 'utf8');
    const failedPages = failedPagesContent.split('\n')
        .map(p => parseInt(p.trim()))
        .filter(p => !isNaN(p));
    
    console.log(`Found ${failedPages.length} failed pages to retry:`);
    console.log(failedPages.join(', '));
    console.log('');
    
    // Load existing data
    let existingData = [];
    if (fs.existsSync('mtprovince_zonal_values_complete.json')) {
        existingData = JSON.parse(fs.readFileSync('mtprovince_zonal_values_complete.json', 'utf8'));
        console.log(`Loaded ${existingData.length} existing records\n`);
    }
    
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (req.resourceType() === 'image') {
            req.abort();
        } else {
            req.continue();
        }
    });
    
    let newProperties = [];
    let stillFailed = [];
    
    for (const pageNum of failedPages) {
        console.log(`\n📄 Retrying Page ${pageNum}...`);
        
        const url = pageNum === 1 
            ? 'https://mtprovince.zonalvalue.com/' 
            : `https://mtprovince.zonalvalue.com/?page=${pageNum}`;
        
        let retries = 0;
        let success = false;
        
        while (retries < 5 && !success) {
            try {
                console.log(`   Attempt ${retries + 1}/5`);
                
                await page.goto(url, {
                    waitUntil: 'networkidle0',
                    timeout: 180000
                });
                
                // Wait for content
                for (let i = 0; i < 15; i++) {
                    await sleep(1000);
                    const hasContent = await page.evaluate(() => {
                        return document.querySelectorAll('.sv-tile_body').length > 0;
                    });
                    if (hasContent) {
                        console.log(`   ✓ Content loaded`);
                        break;
                    }
                }
                
                await sleep(3000);
                
                // Extract data with EXACT selectors
                const pageData = await page.evaluate(() => {
                    const properties = [];
                    const tiles = document.querySelectorAll('.sv-tile_body');
                    
                    tiles.forEach(tile => {
                        const property = {};
                        
                        const infoSection = tile.querySelector('.sv-tile__info');
                        if (infoSection) {
                            const h3 = infoSection.querySelector('h3.sv-tile__title');
                            if (h3) property['Street'] = h3.textContent.trim();
                            
                            const h4 = infoSection.querySelector('h4.sv-tile__subtitle');
                            if (h4) property['Description'] = h4.textContent.trim();
                        }
                        
                        const descSection = tile.querySelector('.sv-tile__description');
                        if (descSection) {
                            const p = descSection.querySelector('p');
                            if (p) property['Barangay'] = p.textContent.trim();
                        }
                        
                        const dataSection = tile.querySelector('.sv-tile__data');
                        if (dataSection) {
                            const table = dataSection.querySelector('.sv-tile__table');
                            if (table) {
                                const rows = table.querySelectorAll('.sv-tile__table-row');
                                rows.forEach(row => {
                                    const nameCol = row.querySelector('.sv-tile__table-column.sv-name');
                                    const valueCol = row.querySelector('.sv-tile__table-column.sv-value');
                                    
                                    if (nameCol && valueCol) {
                                        const nameSpan = nameCol.querySelector('span');
                                        const valueSpan = valueCol.querySelector('span');
                                        
                                        if (nameSpan && valueSpan) {
                                            const key = nameSpan.textContent.trim().replace(':', '');
                                            const value = valueSpan.textContent.trim();
                                            if (key && value) property[key] = value;
                                        }
                                    }
                                });
                            }
                        }
                        
                        const priceWrapper = tile.querySelector('.sv-tile__price-wrapper');
                        if (priceWrapper) {
                            const priceP = priceWrapper.querySelector('p.sv-tile__price');
                            if (priceP) property['Zonal Value'] = priceP.textContent.trim();
                        }
                        
                        if (property['Street'] && property['Zonal Value']) {
                            properties.push(property);
                        }
                    });
                    
                    return properties;
                });
                
                if (pageData.length > 0) {
                    newProperties = newProperties.concat(pageData);
                    console.log(`   ✓ Recovered ${pageData.length} properties`);
                    success = true;
                } else {
                    console.log(`   ⚠ No data found`);
                    retries++;
                }
                
                await sleep(4000);
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
                retries++;
                await sleep(10000);
            }
        }
        
        if (!success) {
            stillFailed.push(pageNum);
        }
    }
    
    await browser.close();
    
    // Combine and save
    console.log('\n===========================================');
    console.log('Results');
    console.log('===========================================');
    console.log(`Previously had: ${existingData.length} records`);
    console.log(`Newly recovered: ${newProperties.length} records`);
    console.log(`Still failed: ${stillFailed.length} pages`);
    
    if (newProperties.length > 0) {
        const allData = existingData.concat(newProperties);
        
        // Remove duplicates
        const uniqueData = [];
        const seen = new Set();
        
        allData.forEach(item => {
            const key = JSON.stringify(item);
            if (!seen.has(key)) {
                seen.add(key);
                uniqueData.push(item);
            }
        });
        
        console.log(`After removing duplicates: ${uniqueData.length} records`);
        
        // Save JSON
        fs.writeFileSync('mtprovince_zonal_values_complete.json', JSON.stringify(uniqueData, null, 2));
        console.log('✓ Saved to mtprovince_zonal_values_complete.json');
        
        // Save CSV
        const headers = [...new Set(uniqueData.flatMap(obj => Object.keys(obj)))];
        let csv = headers.map(h => `"${h}"`).join(',') + '\n';
        uniqueData.forEach(row => {
            csv += headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(',') + '\n';
        });
        fs.writeFileSync('mtprovince_zonal_values_complete.csv', csv);
        console.log('✓ Saved to mtprovince_zonal_values_complete.csv');
    }
    
    if (stillFailed.length > 0) {
        console.log('\n⚠ Still failed pages:', stillFailed.join(', '));
        fs.writeFileSync('failed_pages.txt', stillFailed.join('\n'));
    } else {
        console.log('\n✅ All failed pages recovered!');
        if (fs.existsSync('failed_pages.txt')) {
            fs.unlinkSync('failed_pages.txt');
            console.log('✓ Deleted failed_pages.txt');
        }
    }
}

console.log('⏳ Starting retry in 3 seconds...\n');

setTimeout(() => {
    retryFailedPages()
        .then(() => {
            console.log('\n✅ Retry complete!\n');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Failed:', error.message);
            process.exit(1);
        });
}, 3000);