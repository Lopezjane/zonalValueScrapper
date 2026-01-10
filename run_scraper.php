<?php
/**
 * PHP Wrapper to call Node.js Puppeteer scraper
 * This runs the Node.js script and retrieves the data
 */

class ZonalValueScraperWrapper {
    
    private $nodeScriptPath = 'scraper.js';
    private $jsonOutputFile = 'cebu_zonal_values.json';
    private $csvOutputFile = 'cebu_zonal_values.csv';
    
    /**
     * Check if Node.js is installed
     */
    public function checkNodeInstalled() {
        $output = shell_exec('node --version 2>&1');
        if (strpos($output, 'v') === 0) {
            echo "✓ Node.js is installed: $output\n";
            return true;
        }
        echo "✗ Node.js is not installed\n";
        return false;
    }
    
    /**
     * Check if Puppeteer is installed
     */
    public function checkPuppeteerInstalled() {
        $output = shell_exec('npm list puppeteer 2>&1');
        if (strpos($output, 'puppeteer@') !== false) {
            echo "✓ Puppeteer is installed\n";
            return true;
        }
        echo "✗ Puppeteer is not installed\n";
        echo "Run: npm install puppeteer\n";
        return false;
    }
    
    /**
     * Run the Node.js scraper
     */
    public function runScraper() {
        echo "=================================\n";
        echo "Cebu Zonal Value Scraper\n";
        echo "=================================\n\n";
        
        // Check prerequisites
        if (!$this->checkNodeInstalled()) {
            echo "\nPlease install Node.js first:\n";
            echo "https://nodejs.org/\n";
            return false;
        }
        
        if (!file_exists($this->nodeScriptPath)) {
            echo "\n✗ scraper.js not found!\n";
            echo "Please save the Node.js script as 'scraper.js'\n";
            return false;
        }
        
        echo "\nRunning scraper...\n";
        echo "This may take a minute...\n\n";
        
        // Execute Node.js script
        $command = "node {$this->nodeScriptPath} 2>&1";
        $output = shell_exec($command);
        
        echo $output . "\n";
        
        // Check if files were created
        if (file_exists($this->jsonOutputFile)) {
            echo "\n✓ Scraping completed!\n";
            return true;
        } else {
            echo "\n✗ Scraping failed - no output file generated\n";
            return false;
        }
    }
    
    /**
     * Load scraped data from JSON file
     */
    public function loadData() {
        if (!file_exists($this->jsonOutputFile)) {
            echo "No data file found. Run scraper first.\n";
            return null;
        }
        
        $json = file_get_contents($this->jsonOutputFile);
        return json_decode($json, true);
    }
    
    /**
     * Display statistics about scraped data
     */
    public function showStatistics() {
        $data = $this->loadData();
        
        if (!$data) {
            return;
        }
        
        echo "\n=================================\n";
        echo "DATA STATISTICS\n";
        echo "=================================\n";
        echo "Total records: " . count($data) . "\n";
        
        // Count by city
        $cities = [];
        foreach ($data as $property) {
            if (isset($property['City'])) {
                $city = $property['City'];
                $cities[$city] = ($cities[$city] ?? 0) + 1;
            }
        }
        
        echo "\nRecords by City:\n";
        foreach ($cities as $city => $count) {
            echo "  $city: $count\n";
        }
        
        // Show price range
        $prices = [];
        foreach ($data as $property) {
            // Try different possible field names for price
            $priceFields = ['Price', 'Value', 'Zonal Value', 'price', 'value'];
            foreach ($priceFields as $field) {
                if (isset($property[$field])) {
                    $price = preg_replace('/[^0-9.]/', '', $property[$field]);
                    if (is_numeric($price)) {
                        $prices[] = floatval($price);
                    }
                    break;
                }
            }
        }
        
        if (!empty($prices)) {
            echo "\nPrice Range:\n";
            echo "  Minimum: ₱" . number_format(min($prices), 2) . "\n";
            echo "  Maximum: ₱" . number_format(max($prices), 2) . "\n";
            echo "  Average: ₱" . number_format(array_sum($prices) / count($prices), 2) . "\n";
        }
    }
    
    /**
     * Search properties by criteria
     */
    public function searchProperties($criteria = []) {
        $data = $this->loadData();
        
        if (!$data) {
            return [];
        }
        
        $results = array_filter($data, function($property) use ($criteria) {
            foreach ($criteria as $key => $value) {
                if (!isset($property[$key])) {
                    return false;
                }
                
                if (stripos($property[$key], $value) === false) {
                    return false;
                }
            }
            return true;
        });
        
        return array_values($results);
    }
    
    /**
     * Export to different format
     */
    public function exportToFormat($format = 'json') {
        $data = $this->loadData();
        
        if (!$data) {
            return false;
        }
        
        switch ($format) {
            case 'json':
                $filename = 'export_' . date('Y-m-d_His') . '.json';
                file_put_contents($filename, json_encode($data, JSON_PRETTY_PRINT));
                echo "Exported to: $filename\n";
                break;
                
            case 'csv':
                $filename = 'export_' . date('Y-m-d_His') . '.csv';
                $fp = fopen($filename, 'w');
                
                if (!empty($data)) {
                    fputcsv($fp, array_keys($data[0]));
                    foreach ($data as $row) {
                        fputcsv($fp, $row);
                    }
                }
                
                fclose($fp);
                echo "Exported to: $filename\n";
                break;
                
            case 'html':
                $filename = 'export_' . date('Y-m-d_His') . '.html';
                $html = $this->generateHTMLTable($data);
                file_put_contents($filename, $html);
                echo "Exported to: $filename\n";
                break;
        }
        
        return true;
    }
    
    /**
     * Generate HTML table from data
     */
    private function generateHTMLTable($data) {
        if (empty($data)) {
            return '<p>No data available</p>';
        }
        
        $html = '<!DOCTYPE html>
<html>
<head>
    <title>Cebu Zonal Values</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; }
        tr:nth-child(even) { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Cebu Zonal Values</h1>
    <p>Total Records: ' . count($data) . '</p>
    <table>
        <thead>
            <tr>';
        
        // Headers
        foreach (array_keys($data[0]) as $header) {
            $html .= "<th>" . htmlspecialchars($header) . "</th>";
        }
        
        $html .= '</tr>
        </thead>
        <tbody>';
        
        // Rows
        foreach ($data as $row) {
            $html .= '<tr>';
            foreach ($row as $cell) {
                $html .= '<td>' . htmlspecialchars($cell) . '</td>';
            }
            $html .= '</tr>';
        }
        
        $html .= '</tbody>
    </table>
</body>
</html>';
        
        return $html;
    }
}

// ============================================
// USAGE EXAMPLES
// ============================================

$scraper = new ZonalValueScraperWrapper();

// Run the scraper
$scraper->runScraper();

// Show statistics
$scraper->showStatistics();

// Search for specific properties
// $results = $scraper->searchProperties(['City' => 'MANDAUE']);
// print_r($results);

// Export to HTML
// $scraper->exportToFormat('html');

?>