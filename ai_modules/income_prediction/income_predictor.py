#!/usr/bin/env python3
"""
Income Prediction Module
Uses time series analysis to predict future income
"""

import sys
import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

class IncomePredictor:
    def __init__(self):
        self.min_data_points = 5  # Minimum transactions needed for prediction
    
    def prepare_income_data(self, transactions):
        """
        Convert transactions to time series data for incoming money
        
        Args:
            transactions: List of transaction dicts with amount, createdAt
        
        Returns:
            DataFrame with date and income
        """
        if not transactions or len(transactions) == 0:
            return pd.DataFrame(columns=['ds', 'y'])
        
        # Filter only incoming transactions (positive amounts)
        incoming = []
        for tx in transactions:
            try:
                amount = float(tx.get('amount', 0))
                if amount > 0:  # Only incoming
                    date_str = tx.get('createdAt', '')
                    # Parse date
                    if 'T' in date_str:
                        date = datetime.fromisoformat(date_str.replace('Z', ''))
                    else:
                        date = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
                    
                    incoming.append({
                        'ds': date.date(),
                        'y': amount
                    })
            except Exception as e:
                continue
        
        if not incoming:
            return pd.DataFrame(columns=['ds', 'y'])
        
        # Convert to DataFrame and aggregate by day
        df = pd.DataFrame(incoming)
        df = df.groupby('ds')['y'].sum().reset_index()
        df['ds'] = pd.to_datetime(df['ds'])
        
        return df
    
    def calculate_statistics(self, transactions):
        """Calculate income statistics"""
        if not transactions or len(transactions) == 0:
            return {
                'current_month_income': 0,
                'transaction_count': 0,
                'avg_transaction': 0,
                'avg_daily_income': 0,
                'avg_monthly_income': 0
            }
        
        # Current month income
        now = datetime.now()
        month_start = datetime(now.year, now.month, 1)
        
        current_month = 0
        all_amounts = []
        
        for tx in transactions:
            try:
                amount = float(tx.get('amount', 0))
                if amount > 0:
                    all_amounts.append(amount)
                    
                    date_str = tx.get('createdAt', '')
                    if 'T' in date_str:
                        tx_date = datetime.fromisoformat(date_str.replace('Z', ''))
                    else:
                        tx_date = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
                    
                    if tx_date >= month_start:
                        current_month += amount
            except:
                continue
        
        # Calculate averages
        total_income = sum(all_amounts)
        tx_count = len(all_amounts)
        avg_tx = total_income / tx_count if tx_count > 0 else 0
        
        # Estimate daily and monthly averages
        if tx_count > 0:
            # Assume data spans at least 30 days
            days_span = 30 if tx_count > 10 else 7
            avg_daily = total_income / days_span
            avg_monthly = avg_daily * 30
        else:
            avg_daily = 0
            avg_monthly = 0
        
        return {
            'current_month_income': round(current_month, 2),
            'transaction_count': tx_count,
            'avg_transaction': round(avg_tx, 2),
            'avg_daily_income': round(avg_daily, 2),
            'avg_monthly_income': round(avg_monthly, 2)
        }
    
    def simple_moving_average_prediction(self, df, days_ahead):
        """
        Simple moving average prediction (fallback method)
        """
        if len(df) == 0:
            return 0
        
        # Use last 7 days average
        recent_avg = df['y'].tail(min(7, len(df))).mean()
        
        # Apply slight growth trend if data available
        if len(df) > 7:
            old_avg = df['y'].head(7).mean()
            if old_avg > 0:
                growth_rate = (recent_avg - old_avg) / old_avg
                growth_rate = max(-0.2, min(0.2, growth_rate))  # Cap at ±20%
            else:
                growth_rate = 0
        else:
            growth_rate = 0
        
        # Predict
        prediction = recent_avg * (1 + growth_rate * (days_ahead / 7))
        return max(0, prediction)
    
    def detect_pattern(self, df):
        """
        Detect income pattern
        """
        if len(df) < 5:
            return 'insufficient_data'
        
        # Calculate trend
        recent = df['y'].tail(5).mean()
        older = df['y'].head(5).mean()
        
        if older == 0:
            return 'irregular'
        
        change_pct = (recent - older) / older
        
        if abs(change_pct) < 0.1:
            return 'stable'
        elif change_pct > 0.1:
            return 'increasing'
        elif change_pct < -0.1:
            return 'decreasing'
        else:
            return 'stable'
    
    def calculate_confidence(self, df, pattern):
        """
        Calculate prediction confidence
        """
        if len(df) < 5:
            return 40
        
        # Calculate coefficient of variation
        mean_val = df['y'].mean()
        std_val = df['y'].std()
        
        if mean_val == 0:
            return 50
        
        cv = std_val / mean_val
        
        # Confidence based on consistency
        if cv < 0.3:
            base_confidence = 85
        elif cv < 0.5:
            base_confidence = 75
        elif cv < 0.8:
            base_confidence = 65
        else:
            base_confidence = 55
        
        # Adjust based on data points
        data_bonus = min(10, len(df))
        
        # Adjust based on pattern
        pattern_bonus = {
            'stable': 5,
            'increasing': 0,
            'decreasing': 0,
            'irregular': -10,
            'insufficient_data': -20
        }.get(pattern, 0)
        
        confidence = base_confidence + data_bonus + pattern_bonus
        return max(40, min(95, confidence))
    
    def predict_income(self, transaction_data):
        """
        Main prediction function
        
        Args:
            transaction_data: Dict with 'transactions' list
        
        Returns:
            Prediction results JSON
        """
        try:
            transactions = transaction_data.get('transactions', [])
            
            # Calculate current statistics
            stats = self.calculate_statistics(transactions)
            
            # Prepare time series data
            df = self.prepare_income_data(transactions)
            
            # Check if enough data
            if len(df) < self.min_data_points:
                # Not enough data - use simple estimates
                avg_daily = stats['avg_daily_income']
                
                return {
                    'success': True,
                    'currentIncome': stats['current_month_income'],
                    'transactionCount': stats['transaction_count'],
                    'next7Days': round(avg_daily * 7, 2),
                    'next14Days': round(avg_daily * 14, 2),
                    'next30Days': round(avg_daily * 30, 2),
                    'confidence': 50,
                    'pattern': 'insufficient_data',
                    'averageMonthlyIncome': stats['avg_monthly_income'],
                    'method': 'simple_average'
                }
            
            # Try Prophet for better predictions
            use_prophet = False
            try:
                from prophet import Prophet
                use_prophet = True
            except ImportError:
                use_prophet = False
            
            if use_prophet and len(df) >= 10:
                try:
                    # Use Prophet
                    model = Prophet(
                        daily_seasonality=False,
                        weekly_seasonality=True,
                        yearly_seasonality=False,
                        changepoint_prior_scale=0.05
                    )
                    model.fit(df)
                    
                    # Make predictions
                    future = model.make_future_dataframe(periods=30)
                    forecast = model.predict(future)
                    
                    # Extract predictions
                    today_idx = len(df)
                    pred_7 = forecast['yhat'].iloc[today_idx:today_idx+7].sum()
                    pred_14 = forecast['yhat'].iloc[today_idx:today_idx+14].sum()
                    pred_30 = forecast['yhat'].iloc[today_idx:today_idx+30].sum()
                    
                    # Ensure non-negative
                    pred_7 = max(0, pred_7)
                    pred_14 = max(0, pred_14)
                    pred_30 = max(0, pred_30)
                    
                    method = 'prophet'
                    
                except Exception as e:
                    # Fall back to simple method
                    pred_7 = self.simple_moving_average_prediction(df, 7)
                    pred_14 = self.simple_moving_average_prediction(df, 14)
                    pred_30 = self.simple_moving_average_prediction(df, 30)
                    method = 'moving_average'
            else:
                # Use simple moving average
                pred_7 = self.simple_moving_average_prediction(df, 7)
                pred_14 = self.simple_moving_average_prediction(df, 14)
                pred_30 = self.simple_moving_average_prediction(df, 30)
                method = 'moving_average'
            
            # Detect pattern
            pattern = self.detect_pattern(df)
            
            # Calculate confidence
            confidence = self.calculate_confidence(df, pattern)
            
            return {
                'success': True,
                'currentIncome': stats['current_month_income'],
                'transactionCount': stats['transaction_count'],
                'next7Days': round(pred_7, 2),
                'next14Days': round(pred_14, 2),
                'next30Days': round(pred_30, 2),
                'confidence': confidence,
                'pattern': pattern,
                'averageMonthlyIncome': stats['avg_monthly_income'],
                'method': method
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'currentIncome': 0,
                'transactionCount': 0,
                'next7Days': 0,
                'next14Days': 0,
                'next30Days': 0,
                'confidence': 0,
                'pattern': 'error',
                'averageMonthlyIncome': 0
            }

def main():
    """Main entry point when called from Node.js"""
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'No input data provided'}))
        sys.exit(1)
    
    try:
        # Parse input JSON
        input_data = json.loads(sys.argv[1])
        
        # Initialize predictor
        predictor = IncomePredictor()
        
        # Predict
        result = predictor.predict_income(input_data)
        
        # Output JSON result
        print(json.dumps(result))
        sys.exit(0)
        
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'currentIncome': 0,
            'transactionCount': 0,
            'next7Days': 0,
            'next14Days': 0,
            'next30Days': 0,
            'confidence': 0,
            'pattern': 'error'
        }))
        sys.exit(1)

if __name__ == '__main__':
    main()