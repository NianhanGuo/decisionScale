# Decision Scale 🪿

A tool for people who make pros and cons lists instead of just deciding things.

## What is this

A local web app that helps you weigh decisions by recording pros and cons,
scoring them by importance, and watching a little scale tip in real time
toward whatever your gut already knew.

There is also a goose.

## Features

- **Pros & cons** with 1–5 star importance ratings
- **Live balance scale** that tilts as you add items
- **Verdict engine** that tells you what you're leaning toward
  (you are free to ignore it)
- **Decision history** with tags and search, because some of us
  have a lot of unresolved situations
- **Mark as resolved** — for the rare occasions things get resolved
- **A wandering goose** that honks occasionally and, if asked,
  dispenses wisdom in the tradition of Kafka but friendlier

## The Goose

The goose walks around your screen autonomously. It has opinions.

You can click it to ask a question. It will respond with something
that is technically an answer. You can also grant it access to your
reflections, at which point it will comment on your specific situation
in ways that are uncomfortably accurate.

The goose runs on Claude Haiku. This costs approximately nothing.

## Setup

1. Clone or download the project
2. Get an Anthropic API key at console.anthropic.com
3. Add your key to `config.js`
4. Open `index.html` in a browser
5. Begin deliberating

No npm. No build step. No node_modules folder silently judging you.

## Stack

- HTML, CSS, vanilla JavaScript
- LocalStorage (your decisions stay on your machine)
- Anthropic API (the goose)
- Web Audio API (the honk)

## FAQ

**Does it make decisions for me?**
No. That would defeat the purpose and also the goose refuses.

**Is my data private?**
Everything lives in your browser's localStorage. Nothing is sent anywhere
unless you ask the goose something, in which case your question
(and optionally your reflection notes) go to the Anthropic API.

**Why a goose?**
This question was considered carefully and then a goose was added anyway.

**The goose walked off my screen.**
It will come back.

