// scraper_kalinga_apayao.js - Fixed version with proper content stability checks
const puppeteer = require('puppeteer');
const fs = require('fs');

const CONFIG = {
    maxRetries: 3,
    timeout: 90000,
    delayBetweenPages: 4000,
    startPage: 1,
    maxPages: 638,
    waitForContentTime: 45000
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeWithRetry(page, url, retries = 0) {
    try {
        console.log(`   Attempting to load... (attempt ${retries + 1})`);
        
        await page.goto(url, {
            waitUntil: 'load',
            timeout: CONFIG.timeout
        });
        
        console.log(`   ✓ Page loaded, waiting for content...`);
        
        let contentLoaded = false;
        let tilesCount = 0;
        let previousCount = 0;
        const maxWaitSeconds = Math.floor(CONFIG.waitForContentTime / 1000);
        
        for (let i = 0; i < maxWaitSeconds; i++) {
            await sleep(1000);
            
            tilesCount = await page.evaluate(() => {
                let count = document.querySelectorAll('.sv-tile_body').length;
                if (count === 0) {
                    count = document.querySelectorAll('[class*="sv-tile"]').length;
                }
                if (count === 0) {
                    count = document.querySelectorAll('.sv-tile').length;
                }
                return count;
            });
            
            if (tilesCount > 0) {
                // Check if content is stable (count hasn't changed)
                if (tilesCount === previousCount && tilesCount > 0) {
                    contentLoaded = true;
                    console.log(`   ✓ Content stable: ${tilesCount} tiles confirmed after ${i + 1}s`);
                    break;
                } else {
                    if (previousCount > 0 && tilesCount !== previousCount) {
                        console.log(`   ⏳ Content still loading... (${previousCount} → ${tilesCount})`);
                    }
                    previousCount = tilesCount;
                }
            }
            
            if (i > 0 && i % 5 === 0) {
                console.log(`   ⏳ Still waiting... (${i}s / ${maxWaitSeconds}s max) - ${tilesCount} tiles`);
            }
        }
        
        if (!contentLoaded) {
            await page.screenshot({ path: `failed_page_${retries + 1}.png` });
            console.log(`   📸 Screenshot saved to failed_page_${retries + 1}.png`);
            throw new Error('Content did not load in time');
        }
        
        // Extra wait for all tiles to fully render
        console.log(`   ⏳ Waiting for all tiles to fully render...`);
        await sleep(5000);
        
        // Verify final count
        const finalCount = await page.evaluate(() => {
            return document.querySelectorAll('.sv-tile_body').length;
        });
        console.log(`   ✓ Ready to extract: ${finalCount} tiles confirmed`);
        
        return true;
        
    } catch (error) {
        if (retries < CONFIG.maxRetries) {
            console.log(`   ⚠ ${error.message}, retrying in 10s...`);
            await sleep(10000);
            return scrapeWithRetry(page, url, retries + 1);
        }
        throw error;
    }
}

async function scrapeZonalValues() {
    console.log('===========================================');
    console.log('tarlac Zonal Value Scraper');
    console.log('Version: Stability-Checked');
    console.log('===========================================\n');
    
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions'
        ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
    
    let allProperties = [];
    let currentPage = CONFIG.startPage;
    let failedPages = [];
    let hasNextPage = true;
    
    try {
        while (hasNextPage && (CONFIG.maxPages === null || currentPage <= CONFIG.maxPages)) {
            console.log(`\n📄 Page ${currentPage}/${CONFIG.maxPages || '?'}`);
            
            const url = currentPage === 1 
                ? 'https://tarlac.zonalvalue.com/' 
                : `https://tarlac.zonalvalue.com/?page=${currentPage}`;
            
            try {
                await scrapeWithRetry(page, url);
                
                // Extract data with validation
                const pageData = await page.evaluate(() => {
                    const properties = [];
                    const seen = new Set();
                    
                    let tiles = document.querySelectorAll('.sv-tile_body');
                    if (tiles.length === 0) {
                        tiles = document.querySelectorAll('[class*="sv-tile"]');
                    }
                    
                    tiles.forEach((tile, index) => {
                        const property = {};
                        
                        // Validate tile has actual content
                        const tileText = tile.textContent.trim();
                        if (tileText.length < 10) {
                            return; // Skip empty or incomplete tiles
                        }
                        
                        // Extract Street
                        const h3 = tile.querySelector('h3.sv-tile__title') || tile.querySelector('h3');
                        if (h3) {
                            const streetText = h3.textContent.trim();
                            if (streetText && streetText.length > 0) {
                                property['Street'] = streetText;
                            }
                        }
                        
                        // Extract Description
                        const h4 = tile.querySelector('h4.sv-tile__subtitle') || tile.querySelector('h4');
                        if (h4) {
                            const descText = h4.textContent.trim();
                            if (descText && descText.length > 0) {
                                property['Description'] = descText;
                            }
                        }
                        
                        // Extract Barangay
                        const descSection = tile.querySelector('.sv-tile__description');
                        if (descSection) {
                            const p = descSection.querySelector('p');
                            if (p) {
                                const barangayText = p.textContent.trim();
                                if (barangayText && barangayText.length > 0) {
                                    property['Barangay'] = barangayText;
                                }
                            }
                        }
                        
                        // Extract table data (City, Province, Classification)
                        const rows = tile.querySelectorAll('.sv-tile__table-row');
                        rows.forEach(row => {
                            const cols = row.querySelectorAll('.sv-tile__table-column');
                            if (cols.length >= 2) {
                                const nameSpan = cols[0].querySelector('span');
                                const valueSpan = cols[1].querySelector('span');
                                
                                if (nameSpan && valueSpan) {
                                    const key = nameSpan.textContent.trim().replace(':', '');
                                    const value = valueSpan.textContent.trim();
                                    
                                    if (key && value && key.length > 0 && value.length > 0) {
                                        property[key] = value;
                                    }
                                }
                            }
                        });
                        
                        // Extract Zonal Value (price)
                        let price = null;
                        
                        // Method 1: Try exact selector
                        const priceP = tile.querySelector('p.sv-tile__price');
                        if (priceP) {
                            const priceText = priceP.textContent.trim();
                            if (priceText && /[\d,]+\.?\d*/.test(priceText)) {
                                price = priceText;
                            }
                        }
                        
                        // Method 2: Try price wrapper
                        if (!price) {
                            const priceWrapper = tile.querySelector('.sv-tile__price-wrapper');
                            if (priceWrapper) {
                                const text = priceWrapper.textContent.trim();
                                const match = text.match(/[\d,]+\.?\d*/);
                                if (match) {
                                    price = match[0];
                                }
                            }
                        }
                        
                        if (price) {
                            property['Zonal Value'] = price;
                        }
                        
                        // Validate essential fields
                        const hasStreetOrDesc = property['Street'] || property['Description'];
                        const hasPrice = property['Zonal Value'];
                        
                        if (!hasStreetOrDesc) {
                            return; // Skip if no street/description
                        }
                        
                        if (!hasPrice) {
                            return; // Skip if no zonal value
                        }
                        
                        // Create unique key for deduplication
                        const uniqueKey = JSON.stringify([
                            property['Street'],
                            property['Description'],
                            property['Barangay'],
                            property['City'],
                            property['Zonal Value']
                        ]);
                        
                        if (!seen.has(uniqueKey)) {
                            seen.add(uniqueKey);
                            properties.push(property);
                        }
                    });
                    
                    return properties;
                });
                
                if (pageData.length > 0) {
                    allProperties = allProperties.concat(pageData);
                    console.log(`   ✓ Extracted ${pageData.length} properties`);
                    console.log(`   📊 Total so far: ${allProperties.length}`);
                    
                    // Show first property from this page to verify accuracy
                    if (pageData.length > 0) {
                        console.log(`   📋 First property: ${pageData[0].Street || pageData[0].Description} - ₱${pageData[0]['Zonal Value']}`);
                    }
                    
                    if (currentPage % 10 === 0) {
                        saveProgress(allProperties, currentPage);
                    }
                } else {
                    console.log(`   ⚠ No data extracted from this page`);
                    failedPages.push(currentPage);
                }
                
                if (CONFIG.maxPages && currentPage >= CONFIG.maxPages) {
                    hasNextPage = false;
                } else {
                    currentPage++;
                    await sleep(CONFIG.delayBetweenPages);
                }
                
            } catch (error) {
                console.log(`   ❌ Failed: ${error.message}`);
                failedPages.push(currentPage);
                currentPage++;
                
                if (failedPages.length > 15) {
                    console.log('\n⚠ Too many failures (15+). Stopping.');
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
            saveFinalResults(allProperties);
            
            console.log('\n📋 Sample (first 5 records):');
            allProperties.slice(0, 5).forEach((prop, i) => {
                console.log(`\n${i + 1}. ${prop.Street || prop.Description}`);
                console.log(`   City: ${prop.City || 'N/A'}`);
                console.log(`   Classification: ${prop.Classification || 'N/A'}`);
                console.log(`   Zonal Value: ₱${prop['Zonal Value']}`);
            });
        }
        
        if (failedPages.length > 0) {
            console.log('\n⚠ Failed pages:', failedPages.join(', '));
            fs.writeFileSync('failed_pages.txt', failedPages.join('\n'));
            console.log('✓ Failed pages saved to failed_pages.txt');
        }
        
        await browser.close();
        return allProperties;
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error.message);
        
        if (allProperties.length > 0) {
            console.log(`\nSaving ${allProperties.length} properties...`);
            saveFinalResults(allProperties);
        }
        
        await browser.close();
        throw error;
    }
}

function saveProgress(data, pageNum) {
    const filename = `progress_page_${pageNum}.json`;
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`   💾 Progress saved`);
}

function saveFinalResults(data) {
    const uniqueData = [];
    const seen = new Set();
    
    data.forEach(item => {
        const key = JSON.stringify(item);
        if (!seen.has(key)) {
            seen.add(key);
            uniqueData.push(item);
        }
    });
    
    console.log(`\nRemoved ${data.length - uniqueData.length} duplicates`);
    
    const jsonFile = 'tarlac_zonal_values_complete.json';
    fs.writeFileSync(jsonFile, JSON.stringify(uniqueData, null, 2));
    console.log(`✓ Saved ${uniqueData.length} records to ${jsonFile}`);
    
    const csvFile = 'tarlac_zonal_values_complete.csv';
    const csv = convertToCSV(uniqueData);
    fs.writeFileSync(csvFile, csv);
    console.log(`✓ Saved to ${csvFile}`);
    
    const summary = createSummary(uniqueData);
    fs.writeFileSync('summary.json', JSON.stringify(summary, null, 2));
    console.log(`✓ Summary saved`);
}

function convertToCSV(data) {
    if (data.length === 0) return '';
    const headers = [...new Set(data.flatMap(obj => Object.keys(obj)))];
    let csv = headers.map(h => `"${h}"`).join(',') + '\n';
    data.forEach(row => {
        csv += headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(',') + '\n';
    });
    return csv;
}

function createSummary(data) {
    const summary = { totalRecords: data.length, timestamp: new Date().toISOString() };
    const cities = {};
    const classifications = {};
    
    data.forEach(prop => {
        const city = prop.City || 'Unknown';
        cities[city] = (cities[city] || 0) + 1;
        const cls = prop.Classification || 'Unknown';
        classifications[cls] = (classifications[cls] || 0) + 1;
    });
    
    summary.byCities = cities;
    summary.byClassification = classifications;
    
    console.log('\n📊 Summary:');
    console.log('   Total:', data.length);
    console.log('   Cities:', Object.keys(cities).length);
    console.log('   Classifications:', Object.keys(classifications).length);
    
    return summary;
}

console.log('⏳ Starting in 3 seconds...\n');
console.log('Configuration:');
console.log(`   URL: https://tarlac.zonalvalue.com/`);
console.log(`   Max wait for content: ${CONFIG.waitForContentTime / 1000}s`);
console.log(`   Max retries: ${CONFIG.maxRetries}`);
console.log(`   Delay between pages: ${CONFIG.delayBetweenPages / 1000}s`);
console.log(`   Max pages: ${CONFIG.maxPages}`);
console.log(`\nFeatures:`);
console.log(`   ✓ Content stability checking`);
console.log(`   ✓ 5-second post-load wait`);
console.log(`   ✓ Per-tile content validation`);
console.log(`   ✓ First property preview per page\n`);

setTimeout(() => {
    scrapeZonalValues()
        .then(() => {
            console.log('\n✅ All done!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Failed:', error.message);
            process.exit(1);
        });
}, 3000);