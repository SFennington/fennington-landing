const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // Serve static files

// CONFIGURE YOUR EMAIL SETTINGS HERE
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', // Change to your SMTP server
  port: 587,
  secure: false,
  auth: {
    user: 'your-email@gmail.com', // CHANGE THIS
    pass: 'your-app-password' // CHANGE THIS - use app-specific password
  }
});

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, service, message } = req.body;
  
  // Validate required fields
  if (!name || !email || !service) {
    return res.status(400).json({ 
      success: false, 
      error: 'Please fill in all required fields' 
    });
  }

  const mailOptions = {
    from: 'your-email@gmail.com', // CHANGE THIS
    to: 'contact@fennington.com',
    replyTo: email,
    subject: `New Contact Form Submission - ${service}`,
    html: `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
      <p><strong>Service:</strong> ${service}</p>
      <p><strong>Message:</strong></p>
      <p>${message || 'No message provided'}</p>
    `,
    text: `
      New Contact Form Submission
      
      Name: ${name}
      Email: ${email}
      Phone: ${phone || 'Not provided'}
      Service: ${service}
      Message: ${message || 'No message provided'}
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully to:', mailOptions.to);
    res.json({ success: true, message: 'Message sent successfully!' });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send message. Please try again.' 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Remember to configure your email settings in server.js!');
});
