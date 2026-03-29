

![Wordle Craft logo](images/logo.svg)

> Design your perfect board · Find matching words


## What is this?

You've seen those beautiful Wordle result grids people share — the perfect zig-zag of yellows, the satisfying wall of greens. **Wordle Craft** lets you design one from scratch, then hands you the exact valid words to type in-game to produce it.

Paint any pattern → get a real word list → play it out in Wordle.

---

## How it works
```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  01. Today's Target │ →  │  02. Design Pattern │ →  │  03. Your Word List │
│                     │    │                     │    │                     │
│  Use today's Wordle │    │  Click tiles to     │    │  6 valid words that │
│  answer or enter    │    │  paint green,       │    │  produce your exact │
│  your own word      │    │  yellow, or gray    │    │  pattern in Wordle  │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

The logic is simple: given a target word and a color pattern for each row, the app finds a valid dictionary word whose letter-match against the target produces exactly that color output — for all 6 rows.

---

## Features

| Feature | Description |
|---|---|
| 🎨 **7 themes** | Swap color palettes to match your vibe |
| 🔀 **Shuffle** | Randomly repaint the grid for inspiration |
| 📋 **One-click copy** | Copy each word individually to clipboard |
| 📖 **Dictionary-valid** | Every word is a real, playable Wordle guess |
| ⚡ **No backend** | Runs entirely in the browser, zero latency |
