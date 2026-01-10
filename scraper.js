// scraper.js - Robust version with retry logic
const puppeteer = require('puppeteer');
const fs = require('fs');

// Configuration
const CONFIG = {
    maxRetries: 3,
    timeout: 120000, // 2 minutes
    delayBetweenPages: 3000, // Increased to 3 seconds
    startPage: 1,
    maxPages: 3 // Set to null for unlimited
};

// Sleep function for older Puppeteer versions
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeWithRetry(page, url, retries = 0) {
    try {
        console.log(`   Attempting to load... (attempt ${retries + 1})`);
        
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: CONFIG.timeout
        });
        
        // Wait for the actual content to appear - try multiple selectors
        let contentLoaded = false;
        for (let i = 0; i < 10; i++) {
            await sleep(1000); // Check every second
            
            const hasContent = await page.evaluate(() => {
                const tiles = document.querySelectorAll('[class*="sv-tile"]');
                return tiles.length > 0;
            });
            
            if (hasContent) {
                contentLoaded = true;
                console.log(`   ✓ Content loaded after ${i + 1} seconds`);
                break;
            }
        }
        
        if (!contentLoaded) {
            throw new Error('Content did not load in time');
        }
        
        // Extra wait for any animations or delayed content
        await sleep(2000);
        
        return true;
    } catch (error) {
        if (retries < CONFIG.maxRetries) {
            console.log(`   ⚠ Failed, retrying... (${retries + 1}/${CONFIG.maxRetries})`);
            await sleep(5000);
            return scrapeWithRetry(page, url, retries + 1);
        }
        throw error;
    }
}

async function scrapeZonalValues() {
    console.log('===========================================');
    console.log('Cebu Zonal Value Scraper - ALL PAGES');
    console.log('===========================================\n');
    
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Block images and fonts to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (req.resourceType() === 'image' || req.resourceType() === 'font') {
            req.abort();
        } else {
            req.continue();
        }
    });
    
    let allProperties = [];
    let currentPage = CONFIG.startPage;
    let failedPages = [];
    let hasNextPage = true;
    
    // Global seen set to track duplicates across ALL pages
    const globalSeen = new Set();
    
    try {
        while (hasNextPage && (CONFIG.maxPages === null || currentPage <= CONFIG.maxPages)) {
            console.log(`\n📄 Page ${currentPage}/${CONFIG.maxPages || '?'}`);
            
            const url = currentPage === 1 
                ? 'https://cebu.zonalvalue.com/' 
                : `https://cebu.zonalvalue.com/?page=${currentPage}`;
            
            try {
                // Try to load the page
                await scrapeWithRetry(page, url);
                
                // Extract data
                const pageData = await page.evaluate(() => {
                    const properties = [];
                    
                    // Find all property cards
                    const cards = document.querySelectorAll('.sv-tile_body');
                    
                    cards.forEach(card => {
                        // Must have h3 to be valid
                        const h3 = card.querySelector('h3');
                        if (!h3) return;
                        
                        const property = {};
                        
                        // Get Street (h3)
                        property['Street'] = h3.textContent.trim();
                        
                        // Get Description (h4)
                        const h4 = card.querySelector('h4');
                        if (h4) {
                            property['Description'] = h4.textContent.trim();
                        }
                        
                        // Get Barangay (p)
                        const p = card.querySelector('p');
                        if (p) {
                            property['Barangay'] = p.textContent.trim();
                        }
                        
                        // Get table data
                        const tableRows = card.querySelectorAll('[class*="table-row"]');
                        tableRows.forEach(row => {
                            let nameElem = row.querySelector('[class*="sv-name"]');
                            let valueElem = row.querySelector('[class*="sv-value"]');
                            
                            if (!nameElem || !valueElem) {
                                const allDivs = row.querySelectorAll('div');
                                if (allDivs.length >= 2) {
                                    nameElem = allDivs[0];
                                    valueElem = allDivs[1];
                                }
                            }
                            
                            if (nameElem && valueElem) {
                                const key = nameElem.textContent.trim().replace(':', '');
                                const value = valueElem.textContent.trim();
                                if (key && value && key.length < 50) {
                                    property[key] = value;
                                }
                            }
                        });
                        
                        // Get Zonal Value
                        const allTextNodes = Array.from(card.querySelectorAll('h2, h3, h4, span, div'));
                        const numbers = [];
                        
                        allTextNodes.forEach(node => {
                            const text = node.textContent.trim();
                            if (/^\d{1,3}(,\d{3})*(\.\d{2})?$/.test(text)) {
                                const num = parseFloat(text.replace(/,/g, ''));
                                if (num > 100) {
                                    numbers.push({ text: text, value: num });
                                }
                            }
                        });
                        
                        if (numbers.length > 0) {
                            numbers.sort((a, b) => b.value - a.value);
                            property['Zonal Value'] = numbers[0].text;
                        }
                        
                        // Only add if has required fields
                        if (property['Street'] && property['Zonal Value']) {
                            properties.push(property);
                        }
                    });
                    
                    return properties;
                });
                
                // Filter duplicates using global seen set
                const uniquePageData = [];
                pageData.forEach(property => {
                    // Create unique key using ALL fields
                    const uniqueKey = JSON.stringify({
                        street: property['Street'] || '',
                        desc: property['Description'] || '',
                        barangay: property['Barangay'] || '',
                        city: property['City'] || '',
                        province: property['Province'] || '',
                        classification: property['Classification'] || '',
                        value: property['Zonal Value'] || ''
                    });
                    
                    if (!globalSeen.has(uniqueKey)) {
                        globalSeen.add(uniqueKey);
                        uniquePageData.push(property);
                    }
                });
                
                if (uniquePageData.length > 0) {
                    allProperties = allProperties.concat(uniquePageData);
                    console.log(`   ✓ Found ${pageData.length} properties (${uniquePageData.length} unique)`);
                    console.log(`   📊 Total: ${allProperties.length}`);
                    
                    // Save progress every 10 pages
                    if (currentPage % 10 === 0) {
                        saveProgress(allProperties, currentPage);
                    }
                } else {
                    console.log(`   ⚠ No unique data found on this page`);
                }
                
                // Check if we should continue
                if (CONFIG.maxPages && currentPage >= CONFIG.maxPages) {
                    hasNextPage = false;
                } else {
                    currentPage++;
                    await sleep(CONFIG.delayBetweenPages);
                }
                
            } catch (error) {
                console.log(`   ❌ Failed to scrape page ${currentPage}: ${error.message}`);
                failedPages.push(currentPage);
                currentPage++;
                
                // If too many consecutive failures, stop
                if (failedPages.length > 5) {
                    console.log('\n⚠ Too many failures. Stopping.');
                    hasNextPage = false;
                }
            }
        }
        
        console.log('\n===========================================');
        console.log('✓ Scraping Complete!');
        console.log('===========================================');
        console.log(`Pages attempted: ${currentPage - 1}`);
        console.log(`Total properties: ${allProperties.length}`);
        console.log(`Failed pages: ${failedPages.length}`);
        
        if (allProperties.length > 0) {
            // Save final results
            saveFinalResults(allProperties);
            
            // Show sample
            console.log('\n📋 Sample (first 2 records):');
            allProperties.slice(0, 2).forEach((prop, i) => {
                console.log(`\n${i + 1}.`);
                Object.entries(prop).forEach(([key, value]) => {
                    console.log(`   ${key}: ${value}`);
                });
            });
        }
        
        if (failedPages.length > 0) {
            console.log('\n⚠ Failed pages:', failedPages.join(', '));
            console.log('You can retry these pages later by setting CONFIG.startPage');
            
            // Save failed pages to a file
            fs.writeFileSync('failed_pages.txt', failedPages.join('\n'));
            console.log('✓ Failed pages saved to failed_pages.txt');
        }
        
        await browser.close();
        return allProperties;
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error.message);
        
        // Save whatever we got
        if (allProperties.length > 0) {
            console.log(`\nSaving ${allProperties.length} properties collected so far...`);
            saveFinalResults(allProperties);
        }
        
        await browser.close();
        throw error;
    }
}

function saveProgress(data, pageNum) {
    const filename = `progress_page_${pageNum}.json`;
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`   💾 Progress saved to ${filename}`);
}

function saveFinalResults(data) {
    // Save JSON
    const jsonFile = 'cebu_zonal_values_complete.json';
    fs.writeFileSync(jsonFile, JSON.stringify(data, null, 2));
    console.log(`\n✓ Saved to ${jsonFile}`);
    
    // Save CSV
    const csvFile = 'cebu_zonal_values_complete.csv';
    const csv = convertToCSV(data);
    fs.writeFileSync(csvFile, csv);
    console.log(`✓ Saved to ${csvFile} (Open in Excel)`);
    
    // Create summary
    const summary = createSummary(data);
    fs.writeFileSync('summary.json', JSON.stringify(summary, null, 2));
    console.log(`✓ Summary saved to summary.json`);
}

function convertToCSV(data) {
    if (data.length === 0) return '';
    
    // Get all unique headers
    const headers = [...new Set(data.flatMap(obj => Object.keys(obj)))];
    
    // Create CSV
    let csv = headers.map(h => `"${h}"`).join(',') + '\n';
    
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header] || '';
            return `"${String(value).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        });
        csv += values.join(',') + '\n';
    });
    
    return csv;
}

function createSummary(data) {
    const summary = {
        totalRecords: data.length,
        timestamp: new Date().toISOString()
    };
    
    // Count by city
    const cities = {};
    data.forEach(prop => {
        const city = prop.City || 'Unknown';
        cities[city] = (cities[city] || 0) + 1;
    });
    summary.byCities = cities;
    
    // Count by classification
    const classifications = {};
    data.forEach(prop => {
        const cls = prop.Classification || 'Unknown';
        classifications[cls] = (classifications[cls] || 0) + 1;
    });
    summary.byClassification = classifications;
    
    console.log('\n📊 Summary:');
    console.log('   Total:', data.length);
    console.log('   Cities:', Object.keys(cities).length);
    console.log('   Classifications:', Object.keys(classifications).length);
    
    return summary;
}

// Run the scraper
console.log('⏳ Starting in 3 seconds...\n');
console.log('Configuration:');
console.log(`   Timeout: ${CONFIG.timeout / 1000}s`);
console.log(`   Max retries: ${CONFIG.maxRetries}`);
console.log(`   Delay between pages: ${CONFIG.delayBetweenPages / 1000}s`);
console.log(`   Max pages: ${CONFIG.maxPages || 'unlimited'}\n`);

setTimeout(() => {
    scrapeZonalValues()
        .then(() => {
            console.log('\n✅ All done! Check these files:');
            console.log('   📊 cebu_zonal_values_complete.csv');
            console.log('   📄 cebu_zonal_values_complete.json');
            console.log('   📈 summary.json\n');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Failed:', error.message);
            console.log('\nTips:');
            console.log('   - Check your internet connection');
            console.log('   - Try running again (progress is saved)');
            console.log('   - Check if any progress_page_*.json files were created\n');
            process.exit(1);
        });
}, 3000);