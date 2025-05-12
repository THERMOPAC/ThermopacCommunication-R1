import { useState, useEffect } from 'react';
import Layout from '../components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';

type InstrumentData = {
  id: number;
  instrument_id: string;
  instrument_name: string;
  instrument_type: string;
  manufacturer: string;
  serial_number: string;
  location: string;
  calibration_frequency: string;
  last_calibration_date: string;
  next_calibration_date: string;
  calibration_status: string;
  certificate_number?: string;
  certificate_file_path?: string;
  certificate_url?: string;
  remarks?: string;
  created_at: string;
  updated_at: string;
};

export default function CalibrationTestPage() {
  const [instruments, setInstruments] = useState<InstrumentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);

  const fetchInstrumentsUsingFetch = async () => {
    setLoading(true);
    setError(null);
    setRawResponse(null);
    
    try {
      const response = await fetch('/api/quality/calibration/instruments', {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      const responseText = await response.text();
      setRawResponse(responseText);
      
      try {
        const data = JSON.parse(responseText);
        console.log('Parsed data:', data);
        
        if (Array.isArray(data)) {
          setInstruments(data);
        } else {
          setError('Response is not an array');
        }
      } catch (jsonError) {
        setError(`Failed to parse JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
      }
    } catch (fetchError) {
      setError(`Network error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchDirectEndpoint = async () => {
    setLoading(true);
    setError(null);
    setRawResponse(null);
    
    try {
      const response = await fetch('/api/testapi/calibration/direct-instruments', {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      const responseText = await response.text();
      setRawResponse(responseText);
      
      try {
        const data = JSON.parse(responseText);
        console.log('Direct endpoint data:', data);
        
        if (Array.isArray(data)) {
          setInstruments(data);
        } else {
          setError('Direct endpoint response is not an array');
        }
      } catch (jsonError) {
        setError(`Failed to parse JSON from direct endpoint: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
      }
    } catch (fetchError) {
      setError(`Network error on direct endpoint: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
    } finally {
      setLoading(false);
    }
  };

  const runSqlDirectly = async () => {
    setLoading(true);
    setError(null);
    setRawResponse(null);
    
    try {
      const response = await fetch('/api/sql/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query: 'SELECT * FROM calibration_instruments ORDER BY next_calibration_date ASC'
        })
      });
      
      const responseText = await response.text();
      setRawResponse(responseText);
      
      try {
        const data = JSON.parse(responseText);
        console.log('SQL direct data:', data);
        
        if (data.rows && Array.isArray(data.rows)) {
          setInstruments(data.rows);
        } else {
          setError('SQL response does not contain rows array');
        }
      } catch (jsonError) {
        setError(`Failed to parse JSON from SQL: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
      }
    } catch (fetchError) {
      setError(`Network error on SQL execution: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
    } finally {
      setLoading(false);
    }
  };

  const testRegularFetch = async () => {
    setLoading(true);
    setError(null);
    setRawResponse(null);
    
    try {
      // Simple test to make sure fetch itself is working
      const response = await fetch('/api/my-permissions', {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      const responseText = await response.text();
      setRawResponse(`API test response: ${responseText}`);
      
      try {
        const data = JSON.parse(responseText);
        console.log('API test data:', data);
        // This is just a test to verify general API connectivity
      } catch (jsonError) {
        setError(`Failed to parse API test JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
      }
    } catch (fetchError) {
      setError(`Network error on API test: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto py-6">
        <h1 className="text-2xl font-bold mb-4">Calibration Test Page</h1>
        <p className="mb-4">This page tests different methods of fetching calibration instruments data.</p>
        
        <div className="flex space-x-4 mb-6">
          <Button 
            onClick={fetchInstrumentsUsingFetch} 
            disabled={loading}
            variant="default"
          >
            Test Normal Endpoint
          </Button>
          
          <Button 
            onClick={fetchDirectEndpoint} 
            disabled={loading}
            variant="secondary"
          >
            Test Direct Endpoint
          </Button>
          
          <Button 
            onClick={runSqlDirectly} 
            disabled={loading}
            variant="outline"
          >
            Run SQL Directly
          </Button>
          
          <Button 
            onClick={testRegularFetch} 
            disabled={loading}
            variant="default"
            className="ml-2"
          >
            Test API Connectivity
          </Button>
        </div>
        
        {loading && <p className="text-blue-500">Loading...</p>}
        {error && (
          <Card className="mb-4 border-red-500">
            <CardHeader>
              <CardTitle className="text-red-500">Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-red-500">{error}</p>
            </CardContent>
          </Card>
        )}
        
        {rawResponse && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Raw Response</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-100 p-4 rounded-md overflow-auto max-h-60">
                <pre className="text-xs">{rawResponse}</pre>
              </div>
            </CardContent>
          </Card>
        )}
        
        <Card>
          <CardHeader>
            <CardTitle>Instruments ({instruments.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {instruments.length === 0 ? (
              <p className="text-gray-500">No instruments found</p>
            ) : (
              <div className="space-y-4">
                {instruments.map((instrument) => (
                  <div key={instrument.id} className="border p-4 rounded-md">
                    <div className="flex justify-between">
                      <h3 className="font-bold">{instrument.instrument_name}</h3>
                      <span className={`text-sm px-2 py-1 rounded-full ${
                        instrument.calibration_status === 'Calibrated' 
                          ? 'bg-green-100 text-green-800' 
                          : instrument.calibration_status === 'Due Soon' 
                            ? 'bg-yellow-100 text-yellow-800' 
                            : 'bg-red-100 text-red-800'
                      }`}>
                        {instrument.calibration_status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">ID: {instrument.instrument_id}</p>
                    <Separator className="my-2" />
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <p><span className="font-medium">Type:</span> {instrument.instrument_type}</p>
                      <p><span className="font-medium">Manufacturer:</span> {instrument.manufacturer}</p>
                      <p><span className="font-medium">Serial:</span> {instrument.serial_number}</p>
                      <p><span className="font-medium">Location:</span> {instrument.location}</p>
                      <p><span className="font-medium">Last Calibration:</span> {instrument.last_calibration_date}</p>
                      <p><span className="font-medium">Next Calibration:</span> {instrument.next_calibration_date}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}