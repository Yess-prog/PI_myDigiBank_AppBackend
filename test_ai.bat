@echo off
echo ========================================
echo Testing AI Modules on Windows
echo ========================================
echo.

echo [1] Testing Fraud Detector...
echo.
python ai_modules\fraud_detection\fraud_detector.py "{\"transaction\":{\"amount\":1000,\"toRib\":\"TN123\",\"createdAt\":\"2025-01-07T10:00:00\"},\"userHistory\":[{\"amount\":500,\"createdAt\":\"2025-01-06T10:00:00\"},{\"amount\":600,\"createdAt\":\"2025-01-05T10:00:00\"}]}"
echo.
echo ----------------------------------------
echo.

echo [2] Testing Income Predictor...
echo.
python ai_modules\income_prediction\income_predictor.py "{\"transactions\":[{\"amount\":500,\"createdAt\":\"2025-01-01T10:00:00\"},{\"amount\":600,\"createdAt\":\"2025-01-02T10:00:00\"},{\"amount\":550,\"createdAt\":\"2025-01-03T10:00:00\"},{\"amount\":700,\"createdAt\":\"2025-01-04T10:00:00\"},{\"amount\":650,\"createdAt\":\"2025-01-05T10:00:00\"}]}"
echo.
echo ----------------------------------------
echo.

echo [3] Testing with large amount (should trigger fraud alert)...
echo.
python ai_modules\fraud_detection\fraud_detector.py "{\"transaction\":{\"amount\":10000,\"toRib\":\"TN123\",\"createdAt\":\"2025-01-07T02:00:00\"},\"userHistory\":[{\"amount\":500,\"createdAt\":\"2025-01-06T10:00:00\"}]}"
echo.
echo ========================================
echo Tests Complete!
echo ========================================
pause