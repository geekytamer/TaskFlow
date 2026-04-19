import "dotenv/config";
import { createServer } from "./server";

const port = process.env.PORT || 4005;

const app = createServer();

app.listen(port, () => {
  console.log(`TaskFlow backend running on http://localhost:${port}`);
});
