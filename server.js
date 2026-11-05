// Entry file: connect to the database, then start listening.
import { config } from './server/config.js';
import { connectDatabase } from './server/db.js';
import { createApp } from './server/app.js';

await connectDatabase();
const app = createApp();

app.listen(config.port, () => {
  console.log(`Portal demo listening on port ${config.port}`);
});
