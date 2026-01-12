<?php

// Configuration
$inputFile = 'cebu_zonal_values_complete.csv';  // Replace with your CSV filename
$outputFile = 'cleaned_file.csv';

// Read the CSV file
$rows = [];
if (($handle = fopen($inputFile, 'r')) !== false) {
    while (($data = fgetcsv($handle)) !== false) {
        $rows[] = $data;
    }
    fclose($handle);
} else {
    die("Error: Could not open file '$inputFile'\n");
}

// Calculate which rows to remove (0-indexed)
// Pattern: 0, 17, 34, 51, 68... (first row of each page)
$rowsToRemove = [];
for ($page = 0; $page < 356; $page++) {
    $rowIndex = $page * 17;
    $rowsToRemove[] = $rowIndex;
}

// Filter rows - keep only the ones we want
$cleanedRows = [];
foreach ($rows as $index => $row) {
    if (!in_array($index, $rowsToRemove)) {
        $cleanedRows[] = $row;
    }
}

// Write to new CSV file
$handle = fopen($outputFile, 'w');
foreach ($cleanedRows as $row) {
    fputcsv($handle, $row);
}
fclose($handle);

// Display results
echo "Original rows: " . count($rows) . "\n";
echo "Rows removed: " . count($rowsToRemove) . "\n";
echo "Remaining rows: " . count($cleanedRows) . "\n";
echo "Cleaned file saved as: $outputFile\n";
echo "\nExpected remaining rows: " . (356 * 16) . " (357 pages × 16 records)\n";
echo "Actual remaining rows: " . count($cleanedRows) . "\n";

?>