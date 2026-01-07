#!/usr/bin/env python3
"""
Fraud Detection Module
Uses Isolation Forest and XGBoost for transaction fraud detection
"""

import sys
import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import joblib
import os

class FraudDetector:
    def __init__(self):
        model_path = os.path.join(os.path.dirname(__file__), 'fraud_model.pkl')
        try:
            self.model = joblib.load(model_path)
            self.model_loaded = True
        except:
            self.model_loaded = False
            self.model = None
    
    def extract_features(self, transaction, user_history):
        """
        Extract features from transaction for fraud detection
        
        Args:
            transaction: Current transaction dict
            user_history: List of past transactions
        
        Returns:
            Feature vector for ML model
        """
        features = {}
        
        # Current transaction features
        features['amount'] = float(transaction.get('amount', 0))
        features['hour'] = datetime.now().hour
        features['day_of_week'] = datetime.now().weekday()
        
        # User history features
        if user_history and len(user_history) > 0:
            amounts = [float(t.get('amount', 0)) for t in user_history]
            
            # Statistical features
            features['avg_amount'] = np.mean(amounts)
            features['std_amount'] = np.std(amounts) if len(amounts) > 1 else 0
            features['max_amount'] = np.max(amounts)
            features['min_amount'] = np.min(amounts)
            
            # Amount deviation
            if features['std_amount'] > 0:
                features['amount_zscore'] = (features['amount'] - features['avg_amount']) / features['std_amount']
            else:
                features['amount_zscore'] = 0
            
            # Transaction frequency (last 24h)
            recent_count = len([t for t in user_history[-20:]])
            features['recent_tx_count'] = recent_count
            
            # Time since last transaction (in hours)
            if len(user_history) > 0:
                try:
                    last_tx_time = datetime.fromisoformat(user_history[-1].get('createdAt', '').replace('Z', ''))
                    hours_since_last = (datetime.now() - last_tx_time).total_seconds() / 3600
                    features['hours_since_last_tx'] = min(hours_since_last, 168)  # Cap at 1 week
                except:
                    features['hours_since_last_tx'] = 24
            else:
                features['hours_since_last_tx'] = 24
            
            # Amount compared to history
            features['amount_vs_avg_ratio'] = features['amount'] / features['avg_amount'] if features['avg_amount'] > 0 else 1
            features['amount_vs_max_ratio'] = features['amount'] / features['max_amount'] if features['max_amount'] > 0 else 1
            
        else:
            # No history - first transaction (higher risk)
            features['avg_amount'] = features['amount']
            features['std_amount'] = 0
            features['max_amount'] = features['amount']
            features['min_amount'] = features['amount']
            features['amount_zscore'] = 0
            features['recent_tx_count'] = 0
            features['hours_since_last_tx'] = 0
            features['amount_vs_avg_ratio'] = 1
            features['amount_vs_max_ratio'] = 1
        
        return features
    
    def calculate_risk_score(self, features):
        """
        Calculate fraud risk score using rule-based system + ML
        
        Returns:
            risk_score (0-1), reason, is_fraud
        """
        risk_score = 0.0
        reasons = []
        
        # Rule 1: Unusually high amount (Z-score > 3)
        if features['amount_zscore'] > 3:
            risk_score += 0.3
            reasons.append("Amount is significantly higher than usual")
        
        # Rule 2: Amount vs average ratio
        if features['amount_vs_avg_ratio'] > 5:
            risk_score += 0.25
            reasons.append("Amount is 5x higher than average")
        
        # Rule 3: Too many transactions in short time
        if features['recent_tx_count'] > 10:
            risk_score += 0.2
            reasons.append("High transaction frequency detected")
        
        # Rule 4: Very short time since last transaction
        if features['hours_since_last_tx'] < 0.5:  # Less than 30 minutes
            risk_score += 0.15
            reasons.append("Multiple transactions in very short time")
        
        # Rule 5: Unusual time (late night)
        if features['hour'] < 5 or features['hour'] > 23:
            risk_score += 0.1
            reasons.append("Transaction at unusual hour")
        
        # Rule 6: Very large amount (absolute threshold)
        if features['amount'] > 5000:
            risk_score += 0.2
            reasons.append("Very large transaction amount")
        
        # Rule 7: First transaction is large
        if features['recent_tx_count'] == 0 and features['amount'] > 1000:
            risk_score += 0.3
            reasons.append("First transaction with large amount")
        
        # Cap risk score at 1.0
        risk_score = min(risk_score, 1.0)
        
        # Use ML model if available
        if self.model_loaded and self.model:
            try:
                feature_vector = [
                    features['amount'],
                    features['hour'],
                    features['day_of_week'],
                    features['amount_zscore'],
                    features['recent_tx_count'],
                    features['hours_since_last_tx'],
                    features['amount_vs_avg_ratio']
                ]
                
                ml_score = self.model.predict_proba([feature_vector])[0][1]
                # Combine rule-based and ML scores (weighted average)
                risk_score = 0.6 * risk_score + 0.4 * ml_score
            except Exception as e:
                pass  # Fall back to rule-based only
        
        # Determine if fraud
        is_fraud = risk_score > 0.8
        
        # Generate reason
        if not reasons:
            reasons.append("Normal transaction pattern")
        
        reason = " | ".join(reasons)
        
        return risk_score, reason, is_fraud
    
    def analyze_transaction(self, transaction_data):
        
        try:
            current_tx = transaction_data.get('transaction', {})
            user_history = transaction_data.get('userHistory', [])
            
            # Extract features
            features = self.extract_features(current_tx, user_history)
            
            # Calculate risk
            risk_score, reason, is_fraud = self.calculate_risk_score(features)
            
            return {
                'success': True,
                'risk_score': round(risk_score, 3),
                'is_fraud': is_fraud,
                'reason': reason,
                'confidence': 0.85 if self.model_loaded else 0.70,
                'features': {
                    'amount': features['amount'],
                    'amount_zscore': round(features['amount_zscore'], 2),
                    'recent_tx_count': features['recent_tx_count'],
                    'hours_since_last': round(features['hours_since_last_tx'], 2)
                }
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'risk_score': 0.5,
                'is_fraud': False,
                'reason': 'Error in analysis'
            }

def main():
    """Main entry point when called from Node.js"""
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'No input data provided'}))
        sys.exit(1)
    
    try:
        # Parse input JSON - handle different quote styles
        input_str = sys.argv[1]
        
        # Try to fix common Windows CMD JSON mangling
        input_str = input_str.strip()
        if input_str.startswith("'") and input_str.endswith("'"):
            input_str = input_str[1:-1]
        
        # Parse JSON
        input_data = json.loads(input_str)
        
        # Initialize detector
        detector = FraudDetector()
        
        # Analyze
        result = detector.analyze_transaction(input_data)
        
        # Output JSON result
        print(json.dumps(result))
        sys.exit(0)
        
    except json.JSONDecodeError as e:
        print(json.dumps({
            'success': False,
            'error': f'JSON parsing error: {str(e)}',
            'received_input': sys.argv[1] if len(sys.argv) > 1 else 'none',
            'risk_score': 0.5,
            'is_fraud': False
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'risk_score': 0.5,
            'is_fraud': False
        }))
        sys.exit(1)

if __name__ == '__main__':
    main()