import "dotenv/config";
import { createServer } from "./server";

const port = Number(process.env.PORT || 4006);
// Unset keeps the historical behaviour of listening on every interface. Set
// HOST=127.0.0.1 wherever a reverse proxy fronts the app, so the port is not
// reachable directly from the internet, bypassing TLS and nginx.
const host = process.env.HOST;

const app = createServer();

const onListening = () => {
  console.log(`TaskFlow backend running on http://${host ?? 'localhost'}:${port}`);
};

if (host) {
  app.listen(port, host, onListening);
} else {
  app.listen(port, onListening);
}
