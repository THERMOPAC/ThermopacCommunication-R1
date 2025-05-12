import Layout from "@/components/layout";
import { CalibrationTestUploader } from "@/components/calibration-test-uploader";

/**
 * Test page for debugging file uploads in calibration module
 */
export default function CalibrationTestPage() {
  return (
    <Layout>
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Calibration Upload Test Page</h1>
        <p className="mb-6 text-gray-600">
          This page is for debugging file upload issues in the calibration module.
        </p>
        
        <div className="my-8">
          <CalibrationTestUploader />
        </div>
      </div>
    </Layout>
  );
}