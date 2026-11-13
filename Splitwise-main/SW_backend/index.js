import 'dotenv/config';
import { createApp } from './app.js';
import { getDb } from './db.js';

const port = Number(process.env.PORT || 4000);
const db = await getDb();
const app = createApp({ db });

app.listen(port, () => {
  console.log(`SW backend running on http://localhost:${port}`);
});
