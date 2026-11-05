// Entry file: connect to the database, then start listening.
//
// No top-level await in this file or anything it imports. Some hosts load the entry
// file with require(), which refuses a module that uses it, and the app never starts.
import { config } from './server/config.js';
import { connectDatabase } from './server/db.js';
import { createApp } from './server/app.js';

console.log('Portal demo starting. Connecting to the database...');

connectDatabase()
  .then(() => {
    console.log('Database connected.');
    createApp().listen(config.port, () => {
      console.log(`Portal demo listening on port ${config.port}`);
    });
  })
  .catch((error) => {
    // The message names the problem. It doesn't include the database password.
    console.error('Could not start:', error.message);
    process.exit(1);
  });
