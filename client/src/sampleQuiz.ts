import type { Quiz } from '@cadoot/shared';

/** A ready-to-play demo quiz so a host can start a game in one click. */
export const SAMPLE_QUIZ: Quiz = {
  title: 'CS & Cyber Warmup',
  questions: [
    {
      text: 'What does "HTTP" stand for?',
      type: 'multiple',
      options: [
        'HyperText Transfer Protocol',
        'High Transfer Text Protocol',
        'Hyperlink Text Transmission Process',
        'Host Transfer Type Protocol',
      ],
      correctIndex: 0,
      timeLimitSec: 20,
    },
    {
      text: 'Which data structure uses FIFO (first-in, first-out) ordering?',
      type: 'multiple',
      options: ['Stack', 'Queue', 'Binary tree', 'Hash map'],
      correctIndex: 1,
      timeLimitSec: 20,
    },
    {
      text: 'HTTPS traffic travels over port 443 by default.',
      type: 'boolean',
      options: ['True', 'False'],
      correctIndex: 0,
      timeLimitSec: 15,
    },
    {
      text: 'A "SQL injection" primarily targets which part of an app?',
      type: 'multiple',
      options: ['The CSS', 'The database layer', 'The DNS resolver', 'The CPU cache'],
      correctIndex: 1,
      timeLimitSec: 25,
    },
    {
      text: 'What is 0b1010 in decimal?',
      type: 'multiple',
      options: ['8', '10', '12', '20'],
      correctIndex: 1,
      timeLimitSec: 20,
    },
    {
      text: 'In Python, a function is defined with the keyword ___.',
      type: 'fill',
      answers: ['def'],
      timeLimitSec: 20,
    },
    {
      text: 'Match each protocol to its default port.',
      type: 'puzzle',
      pairs: [
        { left: 'HTTP', right: '80' },
        { left: 'HTTPS', right: '443' },
        { left: 'SSH', right: '22' },
        { left: 'DNS', right: '53' },
      ],
      timeLimitSec: 40,
    },
    {
      text: 'In one word: what should we learn about next?',
      type: 'open',
      timeLimitSec: 30,
    },
  ],
};
