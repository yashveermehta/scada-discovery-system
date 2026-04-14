# Troubleshooting Guide

## What to Check

### 1. Is Backend Running?
Open: http://localhost:5000/api/info
Should see JSON response

### 2. Is Frontend Running?
Open: http://localhost:5173
Should see the UI

### 3. Browser Console Errors?
Press F12 → Console tab
Look for red errors

### 4. Network Tab?
Press F12 → Network tab
Check if API calls are failing (red)

## Common Problems

### Problem: White/Blank Page
**Solution**: 
- Check browser console for errors
- Make sure Tailwind CSS is loading
- Try: `npm install` again in frontend-react folder

### Problem: "Cannot find module" errors
**Solution**:
```powershell
cd frontend-react
npm install
```

### Problem: API Connection Failed
**Solution**:
- Make sure backend is running: `python backend/api/app.py`
- Check API_BASE_URL in `src/services/apiService.ts` matches backend port

### Problem: Styling looks broken
**Solution**:
- Check `src/index.css` has `@import "tailwindcss"`
- Restart dev server
- Clear browser cache (Ctrl+Shift+R)

## Quick Test

Run these commands:

```powershell
# Terminal 1 - Backend
cd c:\Users\ASUS\Documents\scada-discovery-system
.\venv\Scripts\Activate.ps1
python backend/api/app.py

# Terminal 2 - Frontend  
cd c:\Users\ASUS\Documents\scada-discovery-system\frontend-react
npm run dev
```

Then open: http://localhost:5173

## Still Not Working?

Please share:
1. Screenshot of what you see
2. Browser console errors (F12)
3. Terminal output from `npm run dev`
