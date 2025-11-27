from http.server import BaseHTTPRequestHandler
import json
import os
import requests
import pandas as pd
import numpy as np
from datetime import datetime

class TradingAI:
    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY")
        self.groq_url = "https://api.groq.com/openai/v1/chat/completions"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    def generate_signal(self, symbol, asset_type, timeframe="1d"):
        try:
            # Generate sample data
            df = self.generate_sample_data(symbol)
            current_price = df['close'].iloc[-1]
            
            # Simple technical analysis
            signal, confidence, reasons = self.simple_analysis(df)
            
            # AI Analysis
            ai_analysis = self.get_ai_analysis(symbol, asset_type, current_price, signal, confidence)
            
            return {
                "success": True,
                "symbol": symbol,
                "asset_type": asset_type,
                "current_price": current_price,
                "signal": signal,
                "confidence": confidence,
                "reasons": reasons,
                "ai_analysis": ai_analysis,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            
        except Exception as e:
            return {"error": f"Error: {str(e)}"}
    
    def generate_sample_data(self, symbol):
        np.random.seed(hash(symbol) % 10000)
        prices = [100]
        for i in range(99):
            change = np.random.normal(0.001, 0.02)
            new_price = prices[-1] * (1 + change)
            prices.append(max(new_price, 1))
        
        df = pd.DataFrame({'close': prices})
        return df
    
    def simple_analysis(self, df):
        current_price = df['close'].iloc[-1]
        avg_price = df['close'].mean()
        
        if current_price > avg_price * 1.05:
            return "BUY", 75, ["Price above average", "Bullish momentum"]
        elif current_price < avg_price * 0.95:
            return "SELL", 65, ["Price below average", "Bearish pressure"]
        else:
            return "HOLD", 50, ["Trading in range", "Neutral momentum"]
    
    def get_ai_analysis(self, symbol, asset_type, price, signal, confidence):
        prompt = f"""
        Berikan analisis trading untuk {symbol} ({asset_type}):
        - Perkiraan harga: {price:.2f}
        - Signal: {signal}
        - Confidence: {confidence}%
        
        Berikan rekomendasi trading singkat dengan:
        - Entry price
        - Stop loss 
        - Take profit
        - Risk management
        """
        
        try:
            payload = {
                "model": "llama-3.1-8b-instant",
                "messages": [
                    {"role": "system", "content": "Anda analis trading profesional."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 500
            }
            
            response = requests.post(self.groq_url, headers=self.headers, json=payload, timeout=30)
            result = response.json()
            return result['choices'][0]['message']['content']
        except:
            return "AI analysis sementara tidak tersedia."

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            
            symbol = data.get('symbol', '').upper()
            asset_type = data.get('asset_type', 'crypto')
            
            if not symbol:
                response = {"error": "Symbol harus diisi"}
            else:
                trading_ai = TradingAI()
                response = trading_ai.generate_signal(symbol, asset_type)
            
            self.wfile.write(json.dumps(response).encode())
            
        except Exception as e:
            error_response = {"error": f"Server error: {str(e)}"}
            self.wfile.write(json.dumps(error_response).encode())
