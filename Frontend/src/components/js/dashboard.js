// Dashboard.js
import React from 'react';
import styles from "../css/dashboard.module.css";
import PieChartComponent from '../js/piechart';
import RadarChartComponent from '../js/radarchart';

function Dashboard() {
  
  const airportTrafficData = [
    { name: 'International', value: 45, color: '#3498db' },
    { name: 'Domestic', value: 35, color: '#2ecc71' },
    { name: 'Cargo', value: 15, color: '#e74c3c' },
    { name: 'Private', value: 5, color: '#f39c12' },
  ];

  
  const facilitiesData = [
    { subject: 'Security', score: 92, fullMark: 100 },
    { subject: 'Check-in', score: 85, fullMark: 100 },
    { subject: 'Lounges', score: 78, fullMark: 100 },
    { subject: 'Dining', score: 88, fullMark: 100 },
    { subject: 'Shopping', score: 76, fullMark: 100 },
    { subject: 'Transport', score: 82, fullMark: 100 },
  ];

  return (
    <div className={styles.container}>
      
      
      <div className={styles.chartsContainer}>
        
        <div className={styles.PiechartCard}>
          <h2>Flight Type Distribution</h2>
          <PieChartComponent  data={airportTrafficData} />
        </div>

        
        <div className={styles.RadarchartCard}>
          <h2>Facilities Quality Score</h2>
          <RadarChartComponent 
            data={facilitiesData}
            dataKey="score"
            name="Rating"
            strokeColor="#2ecc71"
            fillColor="#2ecc71"
          />
        </div>
        
      </div>
    </div>
  );
}

export default Dashboard;