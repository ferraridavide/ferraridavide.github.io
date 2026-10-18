---
title: "Staying off the hot path"
pubDate: 2026-10-18
cover: ./cover.jpg
description: "Why simple ideas go untested: we all follow the same “hot path” and assume someone else already checked the obvious."
---
It was two in the morning and I couldn’t catch any sleep trying to make sense of everything that happened this week, from [the new Roadster doing somersaults](https://x.com/Tesla/status/2110913438293647789), to thinking about the comments of mathematicians feeling their ground shake because of a [git push](https://news.ycombinator.com/item?id=49984923), to Claude surprising itself [discovering the seeds to ECDSA curves](https://www.anthropic.com/research/ecdsa-curve-origins#:~:text=Hmm%20wait.%20Let%20me%20be%20careful%20about%20the%20plausibility%3A%20is%20it%20suspicious%20that%20such%20an%20obvious%20thing%20wasn%E2%80%99t%20discovered%20in%2025%20years%3F%20It%E2%80%99s%20verified%20by%20direct%20computation%20on%20my%20side%3A%20160%2Dbit%20match%20from%20a%2032%2Dbit%20seed%20%2B%20small%20index%3A%20no%20chance%20coincidences%20\(10%20%C3%97%20160%20bits\).%20It%E2%80%99s%20real.), to learning that the reason we get to see and live through all of this is (besides literally everything else) because one man back in 1966 was [stubborn enough to believe that low loss fiber optic cables could actually be feasible for telecommunication](https://www.youtube.com/watch?v=NiCgcUTL9_Q), which is how you are reading this today. 

I started playing with two thoughts:  
The first is that I believe to some extent, when approaching a problem, the vast majority of people naturally follow the same thought process, a “[hot path](https://stackoverflow.com/a/68947314)”, and by doing so, some (good) ideas in the periphery of this space are never considered, even if millions of minds pass near it.  

The second is that we tend to overestimate the size of the niche we are in, how many eyes get to see an idea in the specific context and field we are in, and how many minds actually get to give it a shot, dedicate the time and effort to explore it and take it seriously. My thesis is that in general, this is way below what we assume it to be.

We get discouraged thinking everything else must have already been tried, there are 8.3B people on earth, surely someone else must have had my same idea, tried it, and since it’s not known to have worked, it must have definitely failed. We feel too stupid to ask that simple question again. Once everyone "knows" something is a dead end, almost nobody checks. 

My take is that the combination of these two factors means a lot of original and unique ideas get discarded, sometimes precisely because they look too simple: if it’s that obvious, someone must have already tried it. 

It’s the efficient-market assumption applied to ideas, and it’s partly a bystander effect. Everyone assumes the obvious check is someone else’s job, so nobody does it. Sometimes, this behaviour can be observed even outside of small niches, although it is rarer.

A clear example is the discovery of the ECDSA curve seeds: everybody was looking in the same direction, and apparently nobody had tried the simplest approach. Even Claude had to do a double take on this in its chain of thought:

> Hmm wait. Let me be careful about the plausibility: is it suspicious that such an obvious thing wasn’t discovered in 25 years? It’s verified by direct computation on my side: 160-bit match from a 32-bit seed + small index: no chance coincidences (10 × 160 bits). It’s real.

The reality is time and effort are a very finite resource for anyone in any field; we don’t get to spin up [10,000 instances of ourselves](https://openai.com/index/navier-stokes-solution/#:~:text=The%20groups%20varied%20in%20size%2C%20and%20the%20group%20that%20produced%20the%20Navier%E2%80%93Stokes%20resolution%20involved%20on%20the%20order%20of%2010%2C000%20concurrent%20agents.) in the morning to go tackle every possible permutation of the problem space, we need to carefully choose which path is worth following, and we collectively bias ourselves into the same hot path. We also often have only a limited and short-sighted view of what others have tried to inform our decisions (at least until [The Joining](https://pluribus.fandom.com/wiki/The_Joining)), especially when failed attempts get swept under the rug, creating a sort of survivor bias for ideas (which I've now just learned is called the [file-drawer effect](https://en.wikipedia.org/wiki/Publication_bias)).

None of this means the obvious idea usually works. Most of the time, someone really did try, and really did fail. And thank god, otherwise we’d be reinventing the wheel every other week. But a heuristic that’s right most of the time is still wrong some of the time, and the two mistakes don’t cost the same: checking might cost you an afternoon, never checking cost cryptography 25 years.

So the point isn’t to ignore what a field already knows, it’s to notice when ignoring it is cheap. Once you’ve absorbed a field’s lore it becomes hard to see past it, and getting past it is rarely about genius, it’s mostly about being willing to ask the stupid question anyway.

When an idea is cheap to test, “someone surely tried this” is a poor reason not to.