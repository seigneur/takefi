import App from './app';

const app = new App();

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  app.cleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  app.cleanup();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  app.cleanup();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  app.cleanup();
  process.exit(1);
});

// Start the server
app.listen();