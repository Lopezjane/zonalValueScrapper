// scraper.js - COMPLETE ACCURATE VERSION
const puppeteer = require('puppeteer');
const fs = require('fs');

const CONFIG = {
    maxRetries: 3,
    timeout: 120000,
    delayBetweenPages: 3000,
    startPage: 1,
    maxPages: 357
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeWithRetry(page, url, retries = 0) {
    try {
        console.log(`   Loading... (attempt ${retries + 1})`);
        
        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: CONFIG.timeout
        });
        
        // Wait for tiles to be visible
        let contentLoaded = false;
        for (let i = 0; i < 15; i++) {
            await sleep(1000);
            
            const hasContent = await page.evaluate(() => {
                const tiles = document.querySelectorAll('[class*="sv-tile"]');
                return tiles.length > 0;
            });
            
            if (hasContent) {
                contentLoaded = true;
                console.log(`   ✓ Content loaded after ${i + 1}s`);
                break;
            }
        }
        
        if (!contentLoaded) {
            throw new Error('Content did not load');
        }
        
        await sleep(2000); // Extra stabilization
        return true;
    } catch (error) {
        if (retries < CONFIG.maxRetries) {
            console.log(`   ⚠ Retry ${retries + 1}/${CONFIG.maxRetries}`);
            await sleep(5000);
            return scrapeWithRetry(page, url, retries + 1);
        }
        throw error;
    }
}

async function scrapeZonalValues() {
    console.log('===========================================');
    console.log('Cebu Zonal Value Scraper - ACCURATE');
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
    
    // Block unnecessary resources
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
    
    try {
        while (hasNextPage && (CONFIG.maxPages === null || currentPage <= CONFIG.maxPages)) {
            console.log(`\n📄 Page ${currentPage}/${CONFIG.maxPages || '?'}`);
            
            const url = currentPage === 1 
                ? 'https://cebu.zonalvalue.com/' 
                : `https://cebu.zonalvalue.com/?page=${currentPage}`;
            
            try {
                await scrapeWithRetry(page, url);
                
                // COMPREHENSIVE DATA EXTRACTION
                const pageData = await page.evaluate((pageNumber) => {
                    const properties = [];
                    
                    // Find all property tiles (main containers)
                    const tiles = document.querySelectorAll('[class*="sv-tile"]');
                    
                    tiles.forEach((tile, tileIndex) => {
                        // Skip if this doesn't look like a main tile
                        if (tile.querySelectorAll('h3, h2').length === 0) {
                            return;
                        }
                        
                        const property = {};
                        
                        // ===== HEADER SECTION =====
                        const header = tile.querySelector('[class*="sv-tile_header"]') || tile;
                        
                        // Street name (usually h3)
                        const h3Elements = header.querySelectorAll('h3');
                        h3Elements.forEach((h3, idx) => {
                            const text = h3.textContent.trim();
                            if (text && text.length > 0) {
                                if (idx === 0) property['Street'] = text;
                                else property[`Street_${idx}`] = text;
                            }
                        });
                        
                        // Description (usually h4)
                        const h4Elements = header.querySelectorAll('h4');
                        h4Elements.forEach((h4, idx) => {
                            const text = h4.textContent.trim();
                            if (text && text.length > 0) {
                                if (idx === 0) property['Description'] = text;
                                else property[`Description_${idx}`] = text;
                            }
                        });
                        
                        // Barangay (usually first p tag)
                        const pElements = header.querySelectorAll('p');
                        pElements.forEach((p, idx) => {
                            const text = p.textContent.trim();
                            if (text && text.length > 0 && text.length < 200) {
                                if (idx === 0) property['Barangay'] = text;
                                else property[`Location_${idx}`] = text;
                            }
                        });
                        
                        // ===== BODY SECTION - TABLE DATA =====
                        const body = tile.querySelector('[class*="sv-tile_body"]') || tile;
                        
                        // Method 1: Find rows with sv-table-row class
                        let tableRows = body.querySelectorAll('[class*="sv-table-row"]');
                        
                        // Method 2: If no rows found, look for any divs that might be rows
                        if (tableRows.length === 0) {
                            tableRows = body.querySelectorAll('[class*="table"] > div, [class*="row"]');
                        }
                        
                        tableRows.forEach(row => {
                            // Try to find name-value pairs
                            let nameElem = row.querySelector('[class*="sv-name"]');
                            let valueElem = row.querySelector('[class*="sv-value"]');
                            
                            // Fallback: look for first two child divs
                            if (!nameElem || !valueElem) {
                                const childDivs = row.querySelectorAll(':scope > div');
                                if (childDivs.length >= 2) {
                                    nameElem = childDivs[0];
                                    valueElem = childDivs[1];
                                }
                            }
                            
                            if (nameElem && valueElem) {
                                let key = nameElem.textContent.trim();
                                key = key.replace(/[:：]/g, '').trim(); // Remove colons
                                const value = valueElem.textContent.trim();
                                
                                if (key && value && key.length < 100 && value.length < 500) {
                                    property[key] = value;
                                }
                            }
                        });
                        
                        // ===== FOOTER SECTION - ZONAL VALUE =====
                        const footer = tile.querySelector('[class*="sv-tile_footer"]');
                        if (footer) {
                            // Get h2 (usually the zonal value)
                            const h2Elements = footer.querySelectorAll('h2');
                            h2Elements.forEach((h2, idx) => {
                                const text = h2.textContent.trim();
                                if (text && text.length > 0) {
                                    if (idx === 0) property['Zonal Value'] = text;
                                    else property[`Value_${idx}`] = text;
                                }
                            });
                            
                            // Get any unit information (e.g., "per sq.m.")
                            const footerText = footer.textContent;
                            const unitMatch = footerText.match(/per\s+[\w.]+/i);
                            if (unitMatch) {
                                property['Unit'] = unitMatch[0].trim();
                            }
                        }
                        
                        // ===== FALLBACK: If no zonal value found, search entire tile =====
                        if (!property['Zonal Value']) {
                            const allH2 = tile.querySelectorAll('h2');
                            allH2.forEach((h2, idx) => {
                                const text = h2.textContent.trim();
                                // Look for number patterns (prices)
                                if (/^\d{1,3}(,\d{3})*(\.\d{2})?$/.test(text) || text.includes('₱')) {
                                    if (!property['Zonal Value']) {
                                        property['Zonal Value'] = text;
                                    }
                                }
                            });
                        }
                        
                        // ===== ADDITIONAL DATA EXTRACTION =====
                        // Look for any remaining labeled data we might have missed
                        const allSpans = tile.querySelectorAll('span, label, strong');
                        let lastLabel = null;
                        
                        allSpans.forEach(span => {
                            const text = span.textContent.trim();
                            
                            // If it looks like a label (ends with colon)
                            if (text.endsWith(':') || text.endsWith('：')) {
                                lastLabel = text.replace(/[:：]/g, '').trim();
                            } 
                            // If we have a recent label and this looks like a value
                            else if (lastLabel && text && text.length > 0 && text.length < 200) {
                                if (!property[lastLabel]) { // Don't overwrite existing data
                                    property[lastLabel] = text;
                                }
                                lastLabel = null;
                            }
                        });
                        
                        // ===== QUALITY CHECK =====
                        // Only add if we have at least street or barangay AND some data
                        const hasLocation = property['Street'] || property['Barangay'] || property['Description'];
                        const hasData = Object.keys(property).length > 1;
                        
                        if (hasLocation && hasData) {
                            // Add metadata for debugging
                            property['_page'] = pageNumber;
                            property['_index'] = tileIndex;
                            properties.push(property);
                        }
                    });
                    
                    return properties;
                }, currentPage); // Pass currentPage as parameter
                
                if (pageData.length > 0) {
                    allProperties = allProperties.concat(pageData);
                    console.log(`   ✓ Found ${pageData.length} properties`);
                    console.log(`   📊 Total: ${allProperties.length}`);
                    
                    // Save progress every 10 pages
                    if (currentPage % 10 === 0) {
                        saveProgress(allProperties, currentPage);
                    }
                } else {
                    console.log(`   ⚠ No data found`);
                    failedPages.push(currentPage);
                }
                
                if (CONFIG.maxPages && currentPage >= CONFIG.maxPages) {
                    hasNextPage = false;
                } else {
                    currentPage++;
                    await sleep(CONFIG.delayBetweenPages);
                }
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
                failedPages.push(currentPage);
                currentPage++;
                
                if (failedPages.length > 10) {
                    console.log('\n⚠ Too many failures. Stopping.');
                    hasNextPage = false;
                }
            }
        }
        
        console.log('\n===========================================');
        console.log('✓ Scraping Complete!');
        console.log('===========================================');
        console.log(`Pages scraped: ${currentPage - 1}`);
        console.log(`Total properties: ${allProperties.length}`);
        console.log(`Failed pages: ${failedPages.length}`);
        
        if (allProperties.length > 0) {
            saveFinalResults(allProperties);
            
            // Show field statistics
            const allFields = new Set();
            allProperties.forEach(prop => {
                Object.keys(prop).forEach(key => {
                    if (!key.startsWith('_')) allFields.add(key);
                });
            });
            
            console.log('\n📋 Data fields extracted:');
            Array.from(allFields).sort().forEach(field => {
                const count = allProperties.filter(p => p[field]).length;
                console.log(`   ${field}: ${count} records`);
            });
            
            console.log('\n📋 Sample (first 2 records):');
            allProperties.slice(0, 2).forEach((prop, i) => {
                console.log(`\n${i + 1}.`);
                Object.entries(prop).forEach(([key, value]) => {
                    if (!key.startsWith('_')) {
                        console.log(`   ${key}: ${value}`);
                    }
                });
            });
        }
        
        if (failedPages.length > 0) {
            console.log('\n⚠ Failed pages:', failedPages.join(', '));
            fs.writeFileSync('failed_pages.txt', failedPages.join('\n'));
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
    // Remove metadata before saving
    const cleanData = data.map(prop => {
        const clean = { ...prop };
        delete clean._page;
        delete clean._index;
        return clean;
    });
    
    // Save JSON
    const jsonFile = 'cebu_zonal_values_complete.json';
    fs.writeFileSync(jsonFile, JSON.stringify(cleanData, null, 2));
    console.log(`\n✓ Saved to ${jsonFile}`);
    
    // Save CSV
    const csvFile = 'cebu_zonal_values_complete.csv';
    const csv = convertToCSV(cleanData);
    fs.writeFileSync(csvFile, csv);
    console.log(`✓ Saved to ${csvFile}`);
    
    // Create summary
    const summary = createSummary(cleanData);
    fs.writeFileSync('summary.json', JSON.stringify(summary, null, 2));
    console.log(`✓ Summary saved to summary.json`);
}

function convertToCSV(data) {
    if (data.length === 0) return '';
    
    const headers = [...new Set(data.flatMap(obj => Object.keys(obj)))];
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
    
    const cities = {};
    data.forEach(prop => {
        const city = prop.City || 'Unknown';
        cities[city] = (cities[city] || 0) + 1;
    });
    summary.byCity = cities;
    
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

// RUN
console.log('⏳ Starting in 3 seconds...\n');
console.log('Configuration:');
console.log(`   Timeout: ${CONFIG.timeout / 1000}s`);
console.log(`   Retries: ${CONFIG.maxRetries}`);
console.log(`   Delay: ${CONFIG.delayBetweenPages / 1000}s`);
console.log(`   Pages: ${CONFIG.maxPages || 'all'}\n`);

setTimeout(() => {
    scrapeZonalValues()
        .then(() => {
            console.log('\n✅ All done!');
            console.log('   📊 cebu_zonal_values_complete.csv');
            console.log('   📄 cebu_zonal_values_complete.json');
            console.log('   📈 summary.json\n');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Failed:', error.message);
            process.exit(1);
        });
}, 3000);