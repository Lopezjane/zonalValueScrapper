<?php

// Configuration
$inputFile = 'cleaned_file.csv';
$jsonOutputFile = 'cebu_zonal_values_complete.json';
$summaryOutputFile = 'summary.json';

echo "===========================================\n";
echo "CSV to JSON Converter\n";
echo "===========================================\n\n";

// Check if input file exists
if (!file_exists($inputFile)) {
    die("Error: File '$inputFile' not found!\n");
}

// Read CSV file
echo "Reading CSV file...\n";
$data = [];
$headers = [];

if (($handle = fopen($inputFile, 'r')) !== false) {
    // Get headers from first row
    $headers = fgetcsv($handle);
    
    if (!$headers) {
        fclose($handle);
        die("Error: Could not read CSV headers!\n");
    }
    
    echo "Found " . count($headers) . " columns\n";
    echo "Columns: " . implode(', ', $headers) . "\n\n";
    
    // Read all data rows
    $rowCount = 0;
    while (($row = fgetcsv($handle)) !== false) {
        if (count($row) === count($headers)) {
            $record = array_combine($headers, $row);
            $data[] = $record;
            $rowCount++;
        }
    }
    fclose($handle);
    
    echo "✓ Read $rowCount records\n\n";
} else {
    die("Error: Could not open file '$inputFile'\n");
}

// Save JSON file
echo "Creating JSON file...\n";
$jsonContent = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
file_put_contents($jsonOutputFile, $jsonContent);
echo "✓ Saved to $jsonOutputFile\n\n";

// Create summary
echo "Creating summary...\n";
$summary = [
    'totalRecords' => count($data),
    'timestamp' => date('c'),
    'columns' => $headers
];

// Count by City
$cities = [];
foreach ($data as $record) {
    $city = $record['City'] ?? 'Unknown';
    $cities[$city] = ($cities[$city] ?? 0) + 1;
}
$summary['byCity'] = $cities;

// Count by Classification
$classifications = [];
foreach ($data as $record) {
    $classification = $record['Classification'] ?? 'Unknown';
    $classifications[$classification] = ($classifications[$classification] ?? 0) + 1;
}
$summary['byClassification'] = $classifications;

// Count by Barangay
$barangays = [];
foreach ($data as $record) {
    $barangay = $record['Barangay'] ?? 'Unknown';
    $barangays[$barangay] = ($barangays[$barangay] ?? 0) + 1;
}
$summary['byBarangay'] = $barangays;

// Price statistics (if Zonal Value exists)
if (in_array('Zonal Value', $headers)) {
    $prices = [];
    foreach ($data as $record) {
        if (!empty($record['Zonal Value'])) {
            // Remove commas and convert to number
            $price = preg_replace('/[^0-9.]/', '', $record['Zonal Value']);
            if (is_numeric($price) && $price > 0) {
                $prices[] = floatval($price);
            }
        }
    }
    
    if (!empty($prices)) {
        $summary['priceStatistics'] = [
            'count' => count($prices),
            'minimum' => min($prices),
            'maximum' => max($prices),
            'average' => array_sum($prices) / count($prices),
            'median' => calculateMedian($prices)
        ];
    }
}

// Save summary
$summaryContent = json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
file_put_contents($summaryOutputFile, $summaryContent);
echo "✓ Saved to $summaryOutputFile\n\n";

// Display summary
echo "===========================================\n";
echo "SUMMARY\n";
echo "===========================================\n";
echo "Total records: " . number_format($summary['totalRecords']) . "\n";
echo "Total columns: " . count($headers) . "\n\n";

echo "Records by City:\n";
arsort($cities);
$count = 0;
foreach ($cities as $city => $num) {
    echo "  $city: " . number_format($num) . "\n";
    $count++;
    if ($count >= 10) {
        $remaining = count($cities) - 10;
        if ($remaining > 0) {
            echo "  ... and $remaining more cities\n";
        }
        break;
    }
}

echo "\nRecords by Classification:\n";
arsort($classifications);
foreach ($classifications as $classification => $num) {
    echo "  $classification: " . number_format($num) . "\n";
}

if (isset($summary['priceStatistics'])) {
    echo "\nPrice Statistics:\n";
    echo "  Count: " . number_format($summary['priceStatistics']['count']) . "\n";
    echo "  Minimum: ₱" . number_format($summary['priceStatistics']['minimum'], 2) . "\n";
    echo "  Maximum: ₱" . number_format($summary['priceStatistics']['maximum'], 2) . "\n";
    echo "  Average: ₱" . number_format($summary['priceStatistics']['average'], 2) . "\n";
    echo "  Median: ₱" . number_format($summary['priceStatistics']['median'], 2) . "\n";
}

echo "\n===========================================\n";
echo "✅ COMPLETE!\n";
echo "===========================================\n";
echo "Files created:\n";
echo "  📄 $jsonOutputFile\n";
echo "  📈 $summaryOutputFile\n\n";

// Helper function to calculate median
function calculateMedian($numbers) {
    sort($numbers);
    $count = count($numbers);
    $middle = floor($count / 2);
    
    if ($count % 2 == 0) {
        return ($numbers[$middle - 1] + $numbers[$middle]) / 2;
    } else {
        return $numbers[$middle];
    }
}

?>