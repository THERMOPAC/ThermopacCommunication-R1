import nodemailer from 'nodemailer';

async function testGmailSMTP() {
  try {
    console.log('Testing Gmail SMTP configuration...');
    
    // Check environment variables
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.error('Gmail credentials not found in environment variables');
      return;
    }
    
    console.log(`Gmail User: ${process.env.GMAIL_USER}`);
    console.log(`Gmail App Password exists: ${!!process.env.GMAIL_APP_PASSWORD}`);
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
    
    console.log('Gmail transporter created successfully');
    
    // Test the connection
    const isConnected = await transporter.verify();
    console.log('Gmail SMTP Connection Test:', isConnected ? 'SUCCESS' : 'FAILED');
    
    if (isConnected) {
      console.log('Gmail SMTP is properly configured and ready to send emails!');
      
      // Send a test email
      const result = await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: 'pe2@thermopac.in',
        subject: 'Gmail SMTP Test - THERMOPAC ERP',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1e40af; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">THERMOPAC</h1>
              <p style="margin: 5px 0 0 0;">Gmail SMTP Test Email</p>
            </div>
            
            <div style="padding: 30px 20px;">
              <h2 style="color: #1e40af; margin-bottom: 20px;">Gmail SMTP Configuration Successful!</h2>
              
              <p>This test email confirms that Gmail SMTP is working correctly for your THERMOPAC ERP system.</p>
              
              <p><strong>Test Details:</strong></p>
              <ul>
                <li>Date: ${new Date().toLocaleString()}</li>
                <li>Gmail User: ${process.env.GMAIL_USER}</li>
                <li>Service: Gmail SMTP</li>
                <li>Status: ✅ Working</li>
              </ul>
              
              <p>Your system is now ready to send password reset emails, security notifications, and other system alerts via Gmail.</p>
            </div>
          </div>
        `
      });
      
      console.log('Test email sent successfully!');
      console.log('Message ID:', result.messageId);
    }
    
  } catch (error) {
    console.error('Gmail SMTP test failed:', error);
  }
}

testGmailSMTP();