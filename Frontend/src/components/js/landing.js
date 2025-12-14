import React from 'react';
import { useNavigate } from "react-router-dom"; 
import styles from "../css/landing.module.css";

const Landing = () => { 
  const navigate = useNavigate(); 

  return (
    <div className={styles.loginContainer}>
      <h1 className={styles.title}>WELCOME TO AEROSPACE</h1>
      
      <div className={styles.buttonsContainer}>
        <button 
          className={styles.Button1} 
          onClick={() => navigate("/login")}
        >
          Login
        </button>
        <button 
          className={styles.Button2}
          onClick={() => navigate("/signup")} 
        >
          Signup
        </button>
      </div>
    </div>
  );
};

export default Landing; // ← Export Landing