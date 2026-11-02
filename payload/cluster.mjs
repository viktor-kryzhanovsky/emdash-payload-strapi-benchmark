// Runs WORKERS copies of the Next.js standalone server on one port (node:cluster).
// The primary only accepts connections and hands them to workers round-robin.
//
// Payload runs prodMigrations on its first DB connection without a lock, so workers
// start one by one: worker 1 is warmed up (connects + migrates) before the rest fork.
import cluster from 'node:cluster'

const WORKERS = Number(process.env.WORKERS) || 2
const PORT = Number(process.env.PORT) || 3000

if (cluster.isPrimary) {
  const fork = () =>
    new Promise((resolve) => cluster.fork().once('listening', resolve))

  async function warmUp() {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${PORT}/en`)).ok) return
      } catch {}
      await new Promise((r) => setTimeout(r, 1000))
    }
    throw new Error('worker 1 did not become ready')
  }

  await fork()
  await warmUp()
  for (let i = 1; i < WORKERS; i++) await fork()
  console.log(`cluster: ${WORKERS} workers on :${PORT}`)

  cluster.on('exit', (worker, code) => {
    console.error(`worker ${worker.process.pid} exited (${code}), restarting`)
    cluster.fork()
  })
} else {
  await import('./server.js')
}
