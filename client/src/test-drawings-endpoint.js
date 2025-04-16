// This file contains test code that can be pasted into the browser console
// when logged in to test the drawings API endpoint

// Function to test the drawings API
async function testDrawingsAPI(drawingNo) {
  try {
    console.log(`Testing drawings API for drawing number: ${drawingNo}`);
    
    // Call the API
    const response = await fetch(`/api/storage/drawings?drawingNo=${drawingNo}`);
    
    if (!response.ok) {
      throw new Error(`API request failed with status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Found ${data.length} drawing files:`);
    console.table(data);
    
    return data;
  } catch (error) {
    console.error('Error testing drawings API:', error);
    return null;
  }
}

// Sample drawing numbers to test
const testDrawings = [
  '4906001001001000',  // Example drawing number
  '490600',            // Partial drawing number
  'TEST-DWG',          // Test drawing
  '123456'             // Random number
];

// Run the tests
async function runTests() {
  console.log('Starting drawing API tests...');
  
  for (const drawingNo of testDrawings) {
    console.log(`\n--- Testing drawing number: ${drawingNo} ---`);
    const results = await testDrawingsAPI(drawingNo);
    
    if (results && results.length > 0) {
      console.log('✅ SUCCESS: Found drawing files');
    } else {
      console.log('❌ FAIL: No drawing files found');
    }
  }
  
  console.log('\nAll tests completed!');
}

// Uncomment to run the tests
// runTests();

// Individual test - can be run directly in console
// testDrawingsAPI('4906001001001000');