// Minimal Prometheus exporter for container CPU / memory / network via the Docker API.
// Replaces cAdvisor, which can't see containers on Docker Desktop's containerd snapshotter.
// Metric names mirror cAdvisor; `name` is the compose service name (payload, postgres, ...).
import http from 'node:http';

const SOCKET = '/var/run/docker.sock';
const PROJECT = process.env.COMPOSE_PROJECT ?? 'whitebit';

function docker(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ socketPath: SOCKET, path }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => (res.statusCode < 300 ? resolve(JSON.parse(body)) : reject(new Error(body))));
      })
      .on('error', reject);
  });
}

async function collect() {
  const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.project=${PROJECT}`] }));
  const containers = await docker(`/containers/json?filters=${filters}`);

  const stats = await Promise.all(
    containers.map(async (c) => ({
      name: c.Labels['com.docker.compose.service'],
      s: await docker(`/containers/${c.Id}/stats?stream=false&one-shot=true`),
    })),
  );

  const lines = [
    '# TYPE container_cpu_usage_seconds_total counter',
    '# TYPE container_memory_working_set_bytes gauge',
    '# TYPE container_memory_limit_bytes gauge',
    '# TYPE container_network_receive_bytes_total counter',
    '# TYPE container_network_transmit_bytes_total counter',
  ];
  for (const { name, s } of stats) {
    const cpu = (s.cpu_stats?.cpu_usage?.total_usage ?? 0) / 1e9;
    const mem = s.memory_stats ?? {};
    // cgroup v2 working set = usage - inactive_file (what `docker stats` shows)
    const workingSet = (mem.usage ?? 0) - (mem.stats?.inactive_file ?? 0);
    const nets = Object.values(s.networks ?? {});
    const rx = nets.reduce((sum, n) => sum + n.rx_bytes, 0);
    const tx = nets.reduce((sum, n) => sum + n.tx_bytes, 0);
    lines.push(`container_cpu_usage_seconds_total{name="${name}"} ${cpu}`);
    lines.push(`container_memory_working_set_bytes{name="${name}"} ${workingSet}`);
    lines.push(`container_memory_limit_bytes{name="${name}"} ${mem.limit ?? 0}`);
    lines.push(`container_network_receive_bytes_total{name="${name}"} ${rx}`);
    lines.push(`container_network_transmit_bytes_total{name="${name}"} ${tx}`);
  }
  return lines.join('\n') + '\n';
}

http
  .createServer(async (req, res) => {
    if (req.url !== '/metrics') return res.writeHead(404).end();
    try {
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }).end(await collect());
    } catch (err) {
      res.writeHead(500).end(String(err));
    }
  })
  .listen(9417, () => console.log(`docker-exporter on :9417 (project ${PROJECT})`));
