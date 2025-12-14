import React from 'react';
import logo from './logo.svg';
import './App.css';
import Landing from "./components/js/landing" ;
import Login from "./components/js/login";
import Dashboard from './components/js/dashboard';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'; // ← ADD THIS


function App() {
  return (
    <div className="App">
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
           <Route path="/login" element={<Login />} />
           <Route path="/signup" element={<Landing />} />
           <Route path="/dashboard" element={<Dashboard/>} />
           
         
        </Routes>
      </Router>
    </div>
  );
}

export default App;