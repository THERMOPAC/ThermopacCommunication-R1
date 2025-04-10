async function resetMasterItemsDatabase() {
  try {
    const response = await fetch('/api/db-maintenance/reset-master-items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include' // Important: include cookies for authentication
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Reset failed:', errorData);
      return { success: false, error: errorData.error, details: errorData.details };
    }
    
    const data = await response.json();
    console.log('Reset successful:', data);
    return { success: true, message: data.message, details: data.details };
  } catch (error) {
    console.error('Reset error:', error);
    return { success: false, error: 'Network or server error', details: error.message };
  }
}

// Execute the function and reload the page on success
resetMasterItemsDatabase().then(result => {
  if (result.success) {
    alert(`Success: ${result.message}\n${result.details || ''}`);
    // Reload the page after a successful reset
    setTimeout(() => window.location.reload(), 1000);
  } else {
    alert(`Error: ${result.error}\n${result.details || ''}`);
  }
});