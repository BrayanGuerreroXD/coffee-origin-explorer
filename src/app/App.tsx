import './app.css'
import { experienceConfig } from '../config'

/**
 * Placeholder shell. The full experience is wired here during integration,
 * once the scene, points and modal modules exist.
 */
export function App() {
  return (
    <main className="app">
      <h1>{experienceConfig.title}</h1>
      <p>{experienceConfig.location}</p>
      <p>{experienceConfig.subtitle}</p>
    </main>
  )
}
