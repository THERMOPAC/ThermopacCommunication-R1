/**
 * Testing utility for drawing searches
 * This file includes client-side code to test the drawing search functionality.
 * 
 * Instructions:
 * 1. Copy this code to the browser console after logging in
 * 2. Run the testDrawingSearch function with a drawing number
 * 
 * For example:
 *   testDrawingSearch('4906001001001000')
 */

async function testDrawingSearch(drawingNo) {
  console.log(`Testing drawing search for: ${drawingNo}`);
  
  try {
    // Call the drawing search API
    const response = await fetch(`/api/storage/drawings?drawingNo=${drawingNo}`);
    
    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Found ${data.length} drawing files`);
    
    if (data.length > 0) {
      console.log('Drawing files found:');
      console.table(data);
      
      // Get download URL for the first file
      const firstFile = data[0];
      console.log('Getting download URL for file:', firstFile.name);
      
      const downloadResponse = await fetch(`/api/storage/download-url?filePath=${encodeURIComponent(firstFile.path)}`);
      if (downloadResponse.ok) {
        const downloadData = await downloadResponse.json();
        console.log('Download URL:', downloadData.downloadUrl);
        
        console.log('You can download this file by navigating to the URL above');
      } else {
        console.error('Failed to get download URL');
      }
    } else {
      console.log('No drawing files found');
    }
    
    return data;
  } catch (error) {
    console.error('Error testing drawing search:', error);
  }
}

/**
 * Run a comprehensive drawing search test with multiple drawing numbers
 */
async function runDrawingTests() {
  const testDrawingNumbers = [
    '4906001001001000',  // Example drawing number
    '490600',            // Partial drawing number
    'TEST-DWG',          // Test drawing
    '123456'             // Random number
  ];
  
  console.log('STARTING DRAWING SEARCH TESTS');
  console.log('------------------------------');
  
  for (const drawingNo of testDrawingNumbers) {
    console.log(`\n--- Testing drawing number: ${drawingNo} ---`);
    const results = await testDrawingSearch(drawingNo);
    
    if (results && results.length > 0) {
      console.log(`✅ SUCCESS: Found ${results.length} drawing file(s)`);
    } else {
      console.log('❌ FAIL: No drawing files found');
    }
  }
  
  console.log('\n------------------------------');
  console.log('ALL DRAWING SEARCH TESTS COMPLETED');
}

// Instructions for use
console.log(`
DRAWING SEARCH TEST UTILITY
--------------------------
This utility allows you to test the drawing search functionality.

To test a specific drawing number, run:
  testDrawingSearch('your-drawing-number')

To run a comprehensive test with multiple drawing numbers, run:
  runDrawingTests()
`);

// Uncomment to run tests immediately
// runDrawingTests();