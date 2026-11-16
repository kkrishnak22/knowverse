---
title: What is Python, and why learn it?
type: subtopic
category: Python
parent: Module 0 · Before you code
description: Python is a programming language that reads almost like English.
tags: [python, basics]
lesson: true
order: 2
status: draft
updated: 2026-11-16
---

```kv-lab
#! title: Your first look at Python
print("Hello from Python!")
print(2 + 3)
```

This is real Python running in your browser. Change the text inside the quotes, or change `2 + 3` to `20 * 5` — the output updates as soon as you stop typing.

## See

**Python** is a *programming language*: a set of words and rules for writing instructions a computer can run. You write Python, and a program called the **Python interpreter** reads it and carries it out.

### Why Python is a good first language

- **It reads like English.** `print("Hello")` does what it says. There's very little extra punctuation to remember.
- **It's used everywhere.** AI and machine learning, data analysis, websites, automation scripts, testing, even ServiceNow and cloud tools.
- **Interviewers accept it.** Most companies let you solve coding rounds in Python, and its short syntax saves you time.

### The same program in Java and Python

| Java | Python |
|---|---|
| `public class Main {` | |
| `  public static void main(String[] args) {` | |
| `    System.out.println("Hello");` | `print("Hello")` |
| `  }` | |
| `}` | |

Both print *Hello*. Python needs one line because it doesn't make you write the class and `main` method around it.

> [!mistake] Common wrong idea
> "Python is only for beginners." Python runs huge real systems — YouTube, Instagram and most AI research use it. Easy to start doesn't mean limited.

## Play

```kv-predict
print(2 + 3)
print("2 + 3")
---
? What do these two lines print?
- 5 and 5
+ 5 and 2 + 3
- 2 + 3 and 2 + 3
> Without quotes, `2 + 3` is maths, so Python works out **5**. With quotes it's **text** — Python prints the characters exactly as written.
```

## Remember

> [!recap] In one breath
> Python is a programming language that reads almost like English. The **Python interpreter** reads your code and runs it. It's used in AI, data, web and automation, and it's accepted in most coding interviews.

- `print(...)` shows something on the screen.
- Quotes mean text: `"2 + 3"` is text, `2 + 3` is maths.

## Explain

> [!interview] "Why did you choose Python?"
> *"Python's syntax is short and readable, so I can focus on the logic instead of boilerplate. It also has a huge set of libraries for data, web and AI, so the same language takes me from small scripts to real projects."*

**Follow-up:** *"Is Python compiled or interpreted?"* — Usually called **interpreted**: you run the source code directly with the `python` program. Under the hood, CPython first turns your code into **bytecode** and then runs that bytecode on the Python virtual machine — you'll see this in [[How your code actually runs]].
