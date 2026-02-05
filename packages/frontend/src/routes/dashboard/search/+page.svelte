<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as HoverCard from '$lib/components/ui/hover-card';
	import {
		Card,
		CardContent,
		CardHeader,
		CardTitle,
		CardDescription,
	} from '$lib/components/ui/card';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { MatchingStrategy } from '@open-archiver/types';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import HelpCircle from 'lucide-svelte/icons/help-circle';
	import SearchX from 'lucide-svelte/icons/search-x';
	import X from 'lucide-svelte/icons/x';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { t } from '$lib/translations';
	import * as Pagination from '$lib/components/ui/pagination/index.js';

	let { data }: { data: PageData } = $props();
	let searchResult = $derived(data.searchResult);
	let keywords = $state(data.keywords || '');
	let page = $derived(data.page);
	let error = $derived(data.error);
	let matchingStrategy: MatchingStrategy = $state(
		(data.matchingStrategy as MatchingStrategy) || 'last'
	);

	// Filter state
	let limit = $state(data.limit || 10);
	let filterFrom = $state(data.filters?.from || '');
	let filterTo = $state(data.filters?.to || '');
	let filterCc = $state(data.filters?.cc || '');
	let filterBcc = $state(data.filters?.bcc || '');
	let dateFrom = $state(data.filters?.dateFrom || '');
	let dateTo = $state(data.filters?.dateTo || '');

	// UI state
	let optionsOpen = $state(false);

	const strategies = [
		{ value: 'last', label: $t('app.search.strategy_fuzzy') },
		{ value: 'all', label: $t('app.search.strategy_verbatim') },
		{ value: 'frequency', label: $t('app.search.strategy_frequency') },
	];

	const limitOptions = [10, 25, 50];

	const triggerContent = $derived(
		strategies.find((s) => s.value === matchingStrategy)?.label ??
			$t('app.search.select_strategy')
	);

	const activeFilterCount = $derived(
		[filterFrom, filterTo, filterCc, filterBcc, dateFrom, dateTo].filter(Boolean).length
	);
	const hasActiveFilters = $derived(activeFilterCount > 0);

	let isMounted = $state(false);
	onMount(() => {
		isMounted = true;
	});

	function shadowRender(node: HTMLElement, html: string | undefined) {
		if (html === undefined) return;

		const shadow = node.attachShadow({ mode: 'open' });
		const style = document.createElement('style');
		style.textContent = `em { background-color: #fde047; font-style: normal; color: #1f2937; }`;
		shadow.appendChild(style);
		const content = document.createElement('div');
		content.innerHTML = html;
		shadow.appendChild(content);

		return {
			update(newHtml: string | undefined) {
				if (newHtml === undefined) return;
				content.innerHTML = newHtml;
			},
		};
	}

	function buildSearchUrl(pageNum: number = 1) {
		const params = new URLSearchParams();
		params.set('keywords', keywords);
		params.set('page', String(pageNum));
		params.set('limit', String(limit));
		params.set('matchingStrategy', matchingStrategy);
		if (filterFrom) params.set('from', filterFrom);
		if (filterTo) params.set('to', filterTo);
		if (filterCc) params.set('cc', filterCc);
		if (filterBcc) params.set('bcc', filterBcc);
		if (dateFrom) params.set('dateFrom', dateFrom);
		if (dateTo) params.set('dateTo', dateTo);
		return `/dashboard/search?${params.toString()}`;
	}

	function handleSearch(e: SubmitEvent) {
		e.preventDefault();
		goto(buildSearchUrl(1), { keepFocus: true });
	}

	function clearFilters() {
		filterFrom = '';
		filterTo = '';
		filterCc = '';
		filterBcc = '';
		dateFrom = '';
		dateTo = '';
	}

	function clearKeywords() {
		keywords = '';
	}

	function getHighlightedSnippets(text: string | undefined, snippetLength = 80): string[] {
		if (!text || !text.includes('<em>')) {
			return [];
		}

		const snippets: string[] = [];
		const regex = /<em>.*?<\/em>/g;
		let match;
		let lastIndex = 0;

		while ((match = regex.exec(text)) !== null) {
			if (match.index < lastIndex) {
				continue;
			}

			const matchIndex = match.index;
			const matchLength = match[0].length;

			const start = Math.max(0, matchIndex - snippetLength);
			const end = Math.min(text.length, matchIndex + matchLength + snippetLength);

			lastIndex = end;

			let snippet = text.substring(start, end);

			const openCount = (snippet.match(/<em/g) || []).length;
			const closeCount = (snippet.match(/<\/em>/g) || []).length;

			if (openCount > closeCount) {
				snippet += '</em>';
			}

			if (closeCount > openCount) {
				snippet = '<em>' + snippet;
			}

			if (start > 0) {
				snippet = '...' + snippet;
			}
			if (end < text.length) {
				snippet += '...';
			}

			snippets.push(snippet);
		}

		return snippets;
	}
</script>

<svelte:head>
	<title>{$t('app.search.title')} | Open Archiver</title>
	<meta name="description" content={$t('app.search.description')} />
</svelte:head>

<div class="container mx-auto p-4 md:p-8">
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-2xl font-bold">{$t('app.search.email_search')}</h1>
		<HoverCard.Root>
			<HoverCard.Trigger>
				<Button variant="ghost" size="icon" class="h-8 w-8">
					<HelpCircle class="h-4 w-4" />
				</Button>
			</HoverCard.Trigger>
			<HoverCard.Content class="w-80">
				<div class="space-y-2">
					<h4 class="text-sm font-semibold">{$t('app.search.help_title')}</h4>
					<ul class="text-muted-foreground space-y-1 text-sm">
						<li>{$t('app.search.help_tip_quotes')}</li>
						<li>{$t('app.search.help_tip_filters')}</li>
						<li>{$t('app.search.help_tip_strategy')}</li>
					</ul>
				</div>
			</HoverCard.Content>
		</HoverCard.Root>
	</div>

	<form onsubmit={(e) => handleSearch(e)} class="mb-8 flex flex-col space-y-4">
		<!-- Search input -->
		<div class="flex items-center gap-2">
			<div class="relative flex-grow">
				<Input
					type="search"
					name="keywords"
					placeholder={$t('app.search.placeholder')}
					class="h-12 pr-10"
					bind:value={keywords}
				/>
				{#if keywords}
					<button
						type="button"
						onclick={clearKeywords}
						class="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
					>
						<X class="h-4 w-4" />
					</button>
				{/if}
			</div>
			<Button type="submit" class="h-12 cursor-pointer">
				{$t('app.search.search_button')}
			</Button>
		</div>

		<!-- Collapsible Search Options -->
		<div class="rounded-lg border">
			<button
				type="button"
				onclick={() => (optionsOpen = !optionsOpen)}
				class="hover:bg-accent/50 flex w-full items-center justify-between p-3 text-sm font-medium"
			>
				<span class="flex items-center gap-2">
					{$t('app.search.search_options')}
					{#if hasActiveFilters}
						<span
							class="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs"
						>
							{$t('app.search.filters_active', { count: activeFilterCount } as any)}
						</span>
					{/if}
				</span>
				<ChevronDown
					class="h-4 w-4 transition-transform duration-200 {optionsOpen
						? 'rotate-180'
						: ''}"
				/>
			</button>

			{#if optionsOpen}
				<div class="border-t p-4">
					<div class="grid gap-4 md:grid-cols-4">
						<!-- Row 1: Strategy, From, To -->
						<div class="space-y-2">
							<Label for="strategy">{$t('app.search.strategy_label')}</Label>
							<Select.Root
								type="single"
								name="matchingStrategy"
								bind:value={matchingStrategy}
							>
								<Select.Trigger id="strategy" class="w-full cursor-pointer">
									{triggerContent}
								</Select.Trigger>
								<Select.Content>
									{#each strategies as strategy (strategy.value)}
										<Select.Item
											value={strategy.value}
											label={strategy.label}
											class="cursor-pointer"
										>
											{strategy.label}
										</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="space-y-2">
							<Label for="filter-from">{$t('app.search.filter_from')}</Label>
							<Input
								id="filter-from"
								type="text"
								placeholder={$t('app.search.filter_email_placeholder')}
								bind:value={filterFrom}
							/>
						</div>
						<div class="space-y-2">
							<Label for="filter-to">{$t('app.search.filter_to')}</Label>
							<Input
								id="filter-to"
								type="text"
								placeholder={$t('app.search.filter_email_placeholder')}
								bind:value={filterTo}
							/>
						</div>
						<div class="space-y-2">
							<Label for="filter-cc">{$t('app.search.filter_cc')}</Label>
							<Input
								id="filter-cc"
								type="text"
								placeholder={$t('app.search.filter_email_placeholder')}
								bind:value={filterCc}
							/>
						</div>

						<!-- Row 2: BCC, Date Range -->
						<div class="space-y-2">
							<Label for="filter-bcc">{$t('app.search.filter_bcc')}</Label>
							<Input
								id="filter-bcc"
								type="text"
								placeholder={$t('app.search.filter_email_placeholder')}
								bind:value={filterBcc}
							/>
						</div>
						<div class="space-y-2">
							<Label for="date-from">{$t('app.search.filter_date_from')}</Label>
							<Input id="date-from" type="date" bind:value={dateFrom} />
						</div>
						<div class="space-y-2">
							<Label for="date-to">{$t('app.search.filter_date_to')}</Label>
							<Input id="date-to" type="date" bind:value={dateTo} />
						</div>
						<div class="flex items-end">
							{#if hasActiveFilters}
								<Button type="button" variant="outline" onclick={clearFilters}>
									{$t('app.search.clear_filters')}
								</Button>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</div>
	</form>

	{#if error}
		<Alert.Root variant="destructive" class="mb-4">
			<CircleAlertIcon class="size-4" />
			<Alert.Title>{$t('app.search.error')}</Alert.Title>
			<Alert.Description>{error}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if searchResult}
		<!-- Results header with count and per-page selector -->
		<div class="mb-4 flex items-center justify-between">
			<p class="text-muted-foreground">
				{#if searchResult.total > 0}
					{$t('app.search.found_results_in', {
						total: searchResult.total,
						seconds: (searchResult.processingTimeMs / 1000).toFixed(3),
					} as any)}
				{:else}
					{$t('app.search.found_results', { total: searchResult.total } as any)}
				{/if}
			</p>
			<div class="flex items-center gap-2">
				<span class="text-muted-foreground text-sm">{$t('app.search.show')}</span>
				<Select.Root type="single" bind:value={limit}>
					<Select.Trigger class="w-20 cursor-pointer">
						{limit}
					</Select.Trigger>
					<Select.Content>
						{#each limitOptions as opt}
							<Select.Item value={opt} class="cursor-pointer">{opt}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
				<span class="text-muted-foreground text-sm">{$t('app.search.per_page')}</span>
			</div>
		</div>

		{#if searchResult.hits.length === 0}
			<!-- Empty state -->
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<SearchX class="text-muted-foreground mb-4 h-16 w-16" />
				<h3 class="text-lg font-medium">{$t('app.search.no_results_title')}</h3>
				<p class="text-muted-foreground mt-1">{$t('app.search.no_results_description')}</p>
				{#if hasActiveFilters}
					<Button variant="outline" class="mt-4" onclick={clearFilters}>
						{$t('app.search.clear_filters')}
					</Button>
				{/if}
			</div>
		{:else}
			<!-- Results list -->
			<div class="grid gap-4">
				{#each searchResult.hits as hit}
					{@const _formatted = hit._formatted || {}}
					{@const score = hit._rankingScore ?? 0}
					<a href="/dashboard/archived-emails/{hit.id}" class="block">
						<Card class="transition-shadow hover:shadow-md">
							<CardHeader>
								<div class="flex items-start justify-between gap-4">
									<CardTitle class="flex-1">
										{#if !isMounted}
											<Skeleton class="h-6 w-3/4" />
										{:else}
											<div
												use:shadowRender={_formatted.subject || hit.subject}
											></div>
										{/if}
									</CardTitle>
									<!-- Relevance indicator -->
									{#if score > 0}
										<div
											class="flex gap-0.5"
											title={$t('app.search.relevance', {
												score: Math.round(score * 100),
											} as any)}
										>
											{#each [0.2, 0.4, 0.6, 0.8, 1.0] as threshold}
												<div
													class="h-3 w-1 rounded-sm {score >= threshold
														? 'bg-primary'
														: 'bg-muted'}"
												></div>
											{/each}
										</div>
									{/if}
								</div>
								<CardDescription
									class="divide-foreground/20 flex flex-wrap items-center gap-x-2 divide-x"
								>
									<span class="pr-2">
										<span class="text-muted-foreground"
											>{$t('app.search.from')}:</span
										>
										{#if !isMounted}
											<Skeleton class="inline-block h-4 w-32" />
										{:else}
											<span
												class="inline-block"
												use:shadowRender={_formatted.from || hit.from}
											></span>
										{/if}
									</span>
									<span class="pl-2 pr-2">
										<span class="text-muted-foreground"
											>{$t('app.search.to')}:</span
										>
										{#if !isMounted}
											<Skeleton class="inline-block h-4 w-32" />
										{:else}
											<span
												class="inline-block"
												use:shadowRender={_formatted.to?.join(', ') ||
													hit.to.join(', ')}
											></span>
										{/if}
									</span>
									<span class="pl-2">
										{#if !isMounted}
											<Skeleton class="inline-block h-4 w-24" />
										{:else}
											<span class="inline-block">
												{new Date(hit.timestamp).toLocaleString()}
											</span>
										{/if}
									</span>
								</CardDescription>
							</CardHeader>
							<CardContent class="space-y-2">
								<!-- Body matches -->
								{#if _formatted.body}
									{#each getHighlightedSnippets(_formatted.body) as snippet}
										<div
											class="space-y-2 rounded-md bg-slate-100 p-2 dark:bg-slate-800"
										>
											<p class="text-sm text-gray-500">
												{$t('app.search.in_email_body')}:
											</p>
											{#if !isMounted}
												<Skeleton class="my-2 h-5 w-full bg-gray-200" />
											{:else}
												<p
													class="font-mono text-sm"
													use:shadowRender={snippet}
												></p>
											{/if}
										</div>
									{/each}
								{/if}

								<!-- Attachment matches -->
								{#if _formatted.attachments}
									{#each _formatted.attachments as attachment, i}
										{#if attachment && attachment.content}
											{#each getHighlightedSnippets(attachment.content) as snippet}
												<div
													class="space-y-2 rounded-md bg-slate-100 p-2 dark:bg-slate-800"
												>
													<p class="text-sm text-gray-500">
														{$t('app.search.in_attachment', {
															filename: attachment.filename,
														} as any)}
													</p>
													{#if !isMounted}
														<Skeleton
															class="my-2 h-5 w-full bg-gray-200"
														/>
													{:else}
														<p
															class="font-mono text-sm"
															use:shadowRender={snippet}
														></p>
													{/if}
												</div>
											{/each}
										{/if}
									{/each}
								{/if}
							</CardContent>
						</Card>
					</a>
				{/each}
			</div>

			<!-- Pagination -->
			{#if searchResult.total > searchResult.limit}
				<div class="mt-8">
					<Pagination.Root count={searchResult.total} perPage={searchResult.limit} {page}>
						{#snippet children({ pages, currentPage })}
							<Pagination.Content>
								<Pagination.Item>
									<a href={buildSearchUrl(currentPage - 1)}>
										<Pagination.PrevButton>
											<ChevronLeft class="h-4 w-4" />
											<span class="hidden sm:block"
												>{$t('app.search.prev')}</span
											>
										</Pagination.PrevButton>
									</a>
								</Pagination.Item>
								{#each pages as pg (pg.key)}
									{#if pg.type === 'ellipsis'}
										<Pagination.Item>
											<Pagination.Ellipsis />
										</Pagination.Item>
									{:else}
										<Pagination.Item>
											<a href={buildSearchUrl(pg.value)}>
												<Pagination.Link
													page={pg}
													isActive={currentPage === pg.value}
												>
													{pg.value}
												</Pagination.Link>
											</a>
										</Pagination.Item>
									{/if}
								{/each}
								<Pagination.Item>
									<a href={buildSearchUrl(currentPage + 1)}>
										<Pagination.NextButton>
											<span class="hidden sm:block"
												>{$t('app.search.next')}</span
											>
											<ChevronRight class="h-4 w-4" />
										</Pagination.NextButton>
									</a>
								</Pagination.Item>
							</Pagination.Content>
						{/snippet}
					</Pagination.Root>
				</div>
			{/if}
		{/if}
	{/if}
</div>
