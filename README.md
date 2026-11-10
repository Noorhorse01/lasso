# Lasso

Close rope into loops. The loop and everything inside it vanish, and the bigger the loop, the more it's worth.

A small puzzle game you can keep. It's free, with no ads, no account, no purchases and no tracking. It works offline, and your scores stay on your device.

## Play

**On a computer:** click the green **Code** button on this page, choose **Download ZIP**, unzip it and double-click `index.html`. That one file is the whole game, so you can also download just it and move it wherever you like.

**On a phone:** if someone has hosted the game (see below), open its page in your browser. On an iPhone, tap Share, then Add to Home Screen. It then opens like an app and works with no connection.

## How it works

- Drag a rope piece from the tray onto the 9x9 board, or tap a piece and then a square. Pieces don't turn.
- Rope ends must meet rope ends. Bright dots show the ends that are still free.
- Close a rope into a loop and it disappears with everything inside, burrs included.
- Score grows with the square of the area you lasso, so a big loop is worth far more than several small ones, if you can close it.
- You place all three pieces before getting more. The run ends when none of your pieces fit.
- Close a loop in back-to-back hands to build a chain. Each hand in a row multiplies your points by one more, up to ×5, and a hand with no loop ends it.

Your best score, biggest loop and longest chain are saved on your device, and the end of each run shows how close you came. Nothing is random beyond the documented deal, and nothing adjusts itself to how you play.

**Today** is one board per day, the same for everyone, worked out from the date with no server. When you finish, you can copy a result to share that doesn't give the board away. **Free play** is as many runs as you like, with your best score saved.

Keyboard: `1` `2` `3` pick a piece, arrow keys move, `Enter` places, `Esc` cancels.

## For developers

Everything is in `index.html`, with no build step. The game logic sits in its own marked block with no access to the page, and [docs/rules.md](docs/rules.md) is the exact spec for porting it.

These need [Node](https://nodejs.org) 22.2 or newer:

```bash
node tools/engine.test.mjs
```

```bash
node tools/sim.mjs 300
```

`tools/make-icons.mjs` redraws the app icons.

To host it on GitHub Pages, publish the repository root. `manifest.webmanifest` and `sw.js` make it installable and offline-capable there. A copy opened as a plain file doesn't use them.

## License

MIT. See [LICENSE](LICENSE).
