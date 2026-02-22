---
title: "What I learned designing a multi-agent system [draft]"
date: 2026-02-20T18:48:28Z
publishDate: 2026-02-20T18:48:28Z
cover:
  image: images/cover.jpg
  relative: true
---
I recently started working on a project that aims to automate the research and drafting process behind a cloud assessment document.

If you've never had to write one, a cloud assessment is one of those tasks that is as tedious as it is time-consuming. You get access to a client's AWS accounts and start orienting yourself, understanding the organization structure, mapping cost allocation, figuring out who owns what. You interview the client. You dive into the weeds of an environment you've never seen before. You run automated tools like Prowler and Scout Suite to surface security and configuration issues, then try not to drown in the ocean of flags and checks those tools spit out. Then, once you've somehow made sense of all of it, you sit down and painstakingly stitch everything together into a formal document.

And the document itself is no small thing. A thorough assessment can span a wide range of distinct areas, organization structure and landing zone, security posture and logging, networking, FinOps, each with its own set of standards, priorities, and ways of surfacing what matters. The expertise required isn't just broad, it's deep in multiple directions at once.

Nothing about this process wants to be automated. This is the kind of work that consultants charge a lot for precisely because it resists being written down. A year ago, automating this would have been a fantasy. Not because the steps aren't defined, but because the hardest parts live entirely in the space between them. Edge cases aren't the exception here, they are the rule.

Modern LLMs are remarkably capable of operating in exactly this kind of unstructured, judgment-heavy space, but getting there requires more than a single prompt. To handle this kind of complexity you need a system that can decompose the problem, parallelize work, and bring specialized knowledge to bear on each piece, a _multi-agent system_.

## Why a multi-agent system?

Imagine your manager drops by your desk one morning and says: _"Right, so, here's 300 pages of Prowler output, some internal notes from a call that happened six months ago, a contract PDF, a spreadsheet of cost allocation data across fourteen accounts, the client's org structure which nobody has documented properly, you'll need to check their root account MFA, also the SCPs, landing zone setup, VPC peering configs, logging pipelines, whether they're tagging resources correctly for FinOps, their IAM hygiene, oh and there's a compliance framework they mentioned, SOC 2 I think, or was it ISO, anyway figure it out, the networking guy left some notes somewhere, check those too, and we need the draft by Friday."_

All in one breath. No pause. Just a thud as the stack of paper lands on your desk.

You'd be paralyzed — not because you're not capable, but because nobody is meant to hold that much context and act on it coherently at once. After a deep breath, you'd start organising, tackling one thing at a time, building up a picture piece by piece. The complexity doesn't disappear, it gets distributed.

The same thing happens when you hand a single agent a task this broad. Models perform best when they can focus on a single, well-defined goal. When you pile everything in at once — tool outputs, interview notes, account data, security reports — instruction following degrades. 

Decomposing the problem across multiple specialized agents fixes this. Each agent gets a narrow, well-defined scope: a focused system prompt, only the tools it actually needs, only the context relevant to its task. When an agent only has one job, there's room to get into the specifics of how that job should be done. You can describe the specific frameworks it should reference, the edge cases it will encounter, the structure its output needs to follow, the judgment calls it should make and the ones it should escalate. That level of granularity is simply not achievable in a monolithic prompt — the more ground a single agent has to cover, the more your instructions have to stay high level. Decomposing across specialized agents is ultimately how you achieve the level of granular instruction following the task needs.

It also makes the system modular. Each agent is a discrete, replaceable unit. If one isn't behaving as expected, you can tune it and test it in isolation, confident that changes won't ripple into unrelated parts of the system.

## How to think about building a multi-agent system...

Building a multi-agent system <!--forces you to think about your--> has a lot to do with thinking about your process in clear, explicit terms — surfacing every assumption, every implicit decision and piece of knowledge that usually goes unexamined. What are the actual steps? Where does one responsibility end and another begin? What should happen when you hit an edge case, and who decides?

The moment you try to write it down, you discover how much of your team's process lives as intuition, habit, and shared context rather than explicit knowledge. Things that feel obvious aren't written anywhere because they never needed to be. They exist in the team's head, passed along through experience and proximity, absorbed gradually by anyone new who spends enough time around it.

We tend to forget that this context isn't automagically available to agents. The model doesn't know what you know and doesn't share your assumptions, it hasn't sat in the meetings. Whatever isn't written down doesn't exist, as far as the agent is concerned. So before you can build the system, you have to surface what the process actually is and needs, and often, in doing so, you realize it isn't fully there yet. 

The framing that helped me most during this phase was to deliberately forget about LLMs. When designing the system, I tried to describe the process as if I were staffing it with people. That meant brain-dumping everything: writing detailed responsibilities for each role, spelling out the fine details I'd normally just assume someone would pick up, defining checklists, documenting the edge cases. The kind of thorough, painstaking documentation you'd only ever write if someone's first day depended on it.

If you can't explain what an agent should do to a person, you can't explain it to an agent either. But once you can, writing the system prompt becomes almost mechanical. The unexpected side effect of working this way is that what you end up with isn't just an AI system — it's detailed process documentation that probably didn't exist before. The same material that defines the agent's behavior could be handed to a new hire tomorrow and they'd have a clearer picture of the process than most teams ever write down. It's agnostic: a single source of truth that works equally well for humans and machines.


## ...then how to actually do it

Once the process is mapped and the roles are defined, the agents follow naturally. Each role becomes an agent: a system prompt that captures everything you wrote down about that responsibility, a set of tools scoped to what that role actually needs, and nothing else. The design work you already did translates almost directly.

In this system, the outermost layer is an **orchestrator** — an agent that doesn't do the assessment work itself, but knows the overall plan: which agent runs next, what it receives, what happens with its output. Think of it as the project manager. Below it sits a layer of **specialist subagents**, each owning a domain of the assessment. In my case, before any of them run, two **briefing agents** go first — one to digest the human context coming into the project (call transcripts, contracts, internal notes), one to do a first pass over the AWS environment itself. Their workpapers are then handed down to downstream agents to build on.

Defining roles and wiring up the orchestration is half the battle: once you have agents that need to act on the world, you then have to start thinking carefully about what data they have access to, and how they access it. A well-designed agent is useless if it's staring at data it can't reason about. 

Take Prowler. Prowler is an open-source tool that audits an AWS environment against hundreds of security and configuration checks. It does its job well. It produces JSON output files that can get very large, very fast. I've seen them hit 200MB for a single account on a moderately complex environment. You cannot hand that to an LLM, not without a way to navigate it. The context window fills up, signal drowns in noise, and instruction following degrades in exactly the way we talked about earlier.

The solution isn't to summarize the data upfront and hope you captured what matters. The solution is to build the right interface.

I wrote a custom MCP server that sits in front of the Prowler output and exposes it as a set of purposeful operations:
```
prowler_overview — high-level scan stats, severity breakdown, service coverage
prowler_search — free-text search across check codes, titles, descriptions
prowler_check_detail — full details for a specific check code
prowler_check_resources — list failing resources for a check (supports pagination and region/account filters)
prowler_list_by_service — checks grouped by AWS service
prowler_list_by_severity — checks grouped by severity
prowler_list_by_category — checks grouped by Prowler category (e.g. trust-boundaries)
prowler_account_summary — per-account finding summary
prowler_region_summary — per-region finding summary
prowler_services — all AWS services in the scan with check counts
prowler_categories — all Prowler categories with check counts
```
Look at that list as a sequence, not a catalogue. _Give me an overview. Let me search for something specific. Drill into this check. Show me the failing resources, filter by region._ It almost reads like a conversation, that's not accidental — it mirrors how a human analyst would work through the data. You start wide, you orient yourself, you narrow in. The MCP tools are designed around that cognitive flow, not around how the underlying data happens to be stored.

This is the principle worth extracting: **tools as interfaces designed around how an agent thinks, not around how data is stored.** When designing tooling for agents, the question isn't "how do I expose this data?" — it's "how would a thoughtful analyst actually work through this?" The tools should read like a natural workflow. If they do, the agent will use them in the right order, at the right level of detail, without needing to be explicitly told the sequence.

What I found is that this encourages the agent to explore the data almost with curiosity — following a thread because it looks worth following, drilling deeper into a finding that seems significant, ranging across different angles before settling on what matters. It doesn't treat every data point with the same flat level of attention. It prioritizes and investigates. That quality of engagement is very hard to prompt directly, but it emerges almost naturally when the tooling makes it easy to explore.

This applies to any external data source your system needs to interact with. Wherever you find a mismatch between how data is stored and how an agent needs to reason about it, that's the seam where a purpose-built tool belongs.

## The agent workspace

A system prompt and a set of tools define what an agent *can* do. The workspace defines where it *works*.

Think about what a consultant's desk looks like when they sit down to do this kind of work. It isn't empty. There's a laptop open to the client's environment, a notepad for jotting things down as they go, a template with the sections already blocked out, maybe a checklist pinned to the side. 

The agent workspace is that desk, made concrete as a filesystem. Each subagent gets its own folder — set up before the run begins, in the right state, with the right files already in place. 

In my project, every pillar agent gets three files:

```
./pillar-security/
  scratchpad.md
  findings.md
  section-draft.md
```

**`scratchpad.md`** is the notepad. Notes, intermediate analysis, raw data extracts pulled from tools, threads worth following — anything the agent needs to hold while it's working. This is where thinking happens before it gets shaped into anything presentable. Looking at a scratchpad mid-run is one of the fastest ways to understand what the agent is actually doing and where it's getting stuck.

**`findings.md`** is the workpaper. This is meant as a detailed internal document that support the final report but never get published. They're written for the team, not the client — precise, technical, complete. Every finding gets an ID, a severity, and a full technical description. This file is the authoritative record of what the agent found.

**`section-draft.md`** is the client-facing deliverable — what eventually gets assembled into the final assessment. The distinction between this and the workpaper matters. The findings file captures everything with full technical fidelity. The section draft translates that into something a client can actually read: contextualized, prioritized, actionable, stripped of internal scaffolding. Same underlying substance, completely different register.

The section-draft files don't start empty. They arrive at the agent's desk already structured — pre-compiled with the sections blocked out and markdown comments that tell the agent exactly what goes where:

```markdown
## Findings

<!-- Each finding follows this structure:

### Descriptive Title (CST00N)

**Why It Matters:** Paragraph explaining the significance — what risk it creates, 
what business impact it has, why the client should care.

**Findings:** Paragraph presenting evidence from the environment. Quantify with 
plain language (counts, percentages, estimated savings). No Prowler check codes or ARNs.

**Suggested Remediations:**
- Concise, actionable recommendation — quick wins first, then strategic improvements
```

This is the pre-filled template on the desk — and it's doing more work than it looks like. You're not just telling the agent what to write. You're telling it *in situ* the form it should take. Pre-filling the deliverable file is worth doing almost universally. A blank file and a formatting instruction in the system prompt are not equivalent. Instructions get diluted by the time the agent is deep in a task; structure embedded directly in the file stays visible and present throughout. Think of it less as a template and more as a standing expectation — the agent can see exactly what "done" looks like before it starts. It constrains and guides at the same time.

The specific files will look different for every use case, but the underlying logic is the same: before an agent runs, decide what it needs on its desk. What does it need to hold while it's thinking? What's the internal record it should leave behind? What's the final output, and what shape should it arrive in?
