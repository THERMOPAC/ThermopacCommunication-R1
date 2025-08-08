// Test script to execute LLM Prompt ID 8 and analyze output
import { LLMPromptEngine } from './server/llm-prompt-engine.ts';

async function testLLMPrompt() {
  try {
    console.log('🔍 Testing LLM Prompt ID 8 - Meeting Efficiency Analyzer');
    
    const engine = new LLMPromptEngine();
    
    // Execute the prompt with user ID 3 (Prasad)
    const result = await engine.executePrompt(8, 3, 'claude-3-haiku-20240307');
    
    console.log('\n📊 LLM EXECUTION RESULT:');
    console.log('=' * 80);
    console.log(result);
    console.log('=' * 80);
    
    // Analyze the output
    console.log('\n🔍 ANALYSIS OF OUTPUT:');
    
    // Extract the actual result text from the response object
    const resultText = result.result || '';
    
    // Check if it contains real data
    const hasRealNames = resultText.includes('Jawahar') || resultText.includes('Pallab') || resultText.includes('Rohan') || resultText.includes('Sanjeev');
    console.log(`✓ Contains real THERMOPAC employee names: ${hasRealNames ? 'YES' : 'NO'}`);
    
    // Check for the required format
    const hasCorrectFormat = resultText.includes('Meeting Name:') && resultText.includes('Commitment:') && resultText.includes('Assigned To:');
    console.log(`✓ Uses required clean list format: ${hasCorrectFormat ? 'YES' : 'NO'}`);
    
    // Check for fictional data
    const hasPlaceholders = resultText.includes('JohnDoe') || resultText.includes('[') || resultText.includes('Example') || resultText.includes('placeholder');
    console.log(`✓ Free of fictional/placeholder data: ${hasPlaceholders ? 'NO' : 'YES'}`);
    
    // Check for data unavailable message
    const hasDataUnavailable = resultText.includes('DATA UNAVAILABLE');
    console.log(`✓ Shows authentic data (not DATA UNAVAILABLE): ${hasDataUnavailable ? 'NO' : 'YES'}`);
    
    // Count pending commitments in output
    const commitmentLines = (resultText.match(/Meeting Name:/g) || []).length;
    console.log(`✓ Number of commitments processed: ${commitmentLines}`);
    
    console.log('\n📋 Expected vs Actual:');
    console.log('Expected: 10 real pending commitments');
    console.log(`Actual: ${commitmentLines} commitments found in output`);
    
  } catch (error) {
    console.error('❌ Error executing LLM prompt:', error);
  }
}

testLLMPrompt();