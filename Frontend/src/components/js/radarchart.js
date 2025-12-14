// components/RadarChartComponent.js (Minimal version)
import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

const RadarChartComponent = ({ 
  data, 
  dataKey = "score", 
  name = "Score",
  strokeColor = "#616161ff", 
  fillColor = "#2ecc71",
}) => {
  return (
    <div className="radar-chart-container">
      <ResponsiveContainer width="100%" height={250}>
        <RadarChart 
          cx="50%" 
          cy="50%" 
          outerRadius="70%" 
          data={data}
        >
          <PolarGrid />
          <PolarAngleAxis dataKey="subject" />
          <PolarRadiusAxis />
          <Radar 
            name={name} 
            dataKey={dataKey} 
            stroke={strokeColor} 
            fill={fillColor} 
            fillOpacity={0.6} 
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RadarChartComponent;