# Load Testing with GitHub Actions

## 🚀 Quick Start

### Running 100 Orders in Parallel

1. **Push your code to GitHub** (if not already done)
2. **Go to GitHub Actions tab** in your repository
3. **Click "Load Test - 100 Orders"** workflow
4. **Click "Run workflow"** button
5. **Wait 2-5 minutes** for all 100 orders to complete

## 📊 How It Works

**Architecture:**
- **20 parallel GitHub Action jobs** run simultaneously
- Each job places **5 orders sequentially**
- **Total: 100 orders** in ~2-5 minutes

**Matrix Strategy:**
```yaml
strategy:
  matrix:
    job_number: [1, 2, 3, ..., 20]
  max-parallel: 20
```

## 🎯 Performance Expectations

- **100 orders** in approximately **2-5 minutes**
- **Rate:** ~20-50 orders per minute
- **Free tier friendly** (uses GitHub Actions free minutes)

## 📁 Files

- `.github/workflows/load-test-100-orders.yml` - GitHub Actions workflow
- `place_orders_github_actions.js` - Optimized script for parallel execution
- `place_orders_15_singapore.js` - Local testing script (15 orders, concurrency 15)
- `place_orders_playwright.js` - Original single order script

## 🔧 Customization

### Change Number of Orders

Edit `.github/workflows/load-test-100-orders.yml`:

**For 200 orders:**
```yaml
matrix:
  job_number: [1, 2, 3, ..., 20]  # Keep 20 jobs
env:
  ORDERS_PER_JOB: 10  # Change from 5 to 10
```

**For 50 orders:**
```yaml
matrix:
  job_number: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]  # 10 jobs
env:
  ORDERS_PER_JOB: 5  # Keep at 5
```

## 📈 Viewing Results

After workflow completes:

1. **Check workflow summary** for success/fail counts
2. **Download artifacts** (results JSON files)
3. **View aggregated results** in the final step

## 💡 Local Testing

Before running on GitHub Actions, test locally:

```bash
# Test with 15 orders (fast)
node place_orders_15_singapore.js

# Test GitHub Actions script locally
JOB_NUMBER=1 ORDERS_PER_JOB=5 node place_orders_github_actions.js
```

## ⚠️ Important Notes

1. **Free Tier Limits:**
   - Public repos: Unlimited minutes
   - Private repos: 2000 minutes/month
   - Each 100-order run: ~100-200 minutes total

2. **Rate Limiting:**
   - The server may rate-limit if too many concurrent requests
   - If failures occur, reduce `max-parallel` to 10

3. **Test Environment:**
   - This is designed for TEST environments only
   - Uses test payment card: `5555 3412 4444 1115`
   - All orders use unique emails with timestamps

## 🔒 Security

- No sensitive data is hardcoded
- Test card numbers are public Adyen test cards
- Emails are auto-generated with timestamps

## 📞 Support

If orders fail:
1. Check the failed job logs in GitHub Actions
2. Common issues:
   - Invalid postal codes (must be 6 digits)
   - Invalid card numbers (must use valid test cards)
   - Server rate limiting (reduce concurrency)
