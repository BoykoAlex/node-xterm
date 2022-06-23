# Node=Xterm
Provides server and client part for serving Xterm UI on localhost on the desired port. The Xterm UI is backed by the
OS shell process. The choice of the shell is customizable, i.e. **zsh** vs **bash**, **Commad Prompt** or
**Power Shell**, etc.

## Running
To run the app in dev mode:
- `npm install`
- `npm run dev-build`
- `npm start`
- open http://localhost:3001/terminal/1 in the browser (**3001** - the default port, **1** - id of terminal, pick other
numbers to create new terminal instances)
