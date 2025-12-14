import React, { useState } from "react";
import styles from "../css/login.module.css";
import { useNavigate } from "react-router-dom"; 

const Login = () => {
    const navigate = useNavigate(); 
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [emailError, setEmailError] = useState("");

    // Basic email regex - checks for @ and .
    const validateEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!validateEmail(email)) {
            setEmailError("Please enter a valid email");
            return;
        }
        
        if (password.length < 6) {
            alert("Password must be at least 6 characters");
            return;
        }
        
        // Login logic here
        console.log("Logging in with:", { email, password });
        alert("Login successful!");
    };

    return (
        <div className={styles.container}>
            <div className={styles.loginbox}>
                
                
                <form onSubmit={handleSubmit}>
                    
                        
                        
                   
                  <div className={styles.textboxcontainer}>
                    <button className={styles.backbutton}
                    
                     onClick={() => navigate("/")}>

                       
                    </button>
                    <h1 className={styles.title}>WELCOME BACK</h1>
                        <input 
                            type="text"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setEmailError(""); 
                            }}
                            placeholder="Email"
                            className={styles.inputbox}
                        />
                      
                 
                        <input 
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password"
                             className={styles.inputbox}
                            />
                  
                    </div>
                    
                    <button type="submit" className={styles.button}
                    onClick={() => navigate("/dashboard")}>
                        Login
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;