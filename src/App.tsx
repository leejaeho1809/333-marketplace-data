import { Route, Routes } from 'react-router-dom'
import MarketplacePage from '@/pages/marketplace/MarketplacePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<MarketplacePage />} />
    </Routes>
  )
}

export default App
