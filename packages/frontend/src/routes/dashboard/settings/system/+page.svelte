<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import * as Label from '$lib/components/ui/label';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import * as Select from '$lib/components/ui/select';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte';
	import type { SupportedLanguage } from '@open-archiver/types';
	import { t } from '$lib/translations';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';

	let { data, form }: { data: PageData; form: any } = $props();
	let settings = $state(data.systemSettings);
	let isSaving = $state(false);
	let searchMaxTotalHitsUnlimited = $state(settings.searchMaxTotalHits === null);
	let searchMaxTotalHitsValue = $state(settings.searchMaxTotalHits ?? 1000);
	let defaultExcludedTags = $state<string[]>(settings.defaultExcludedTags ?? []);

	// Available tags from the facets endpoint
	let availableTags = $derived(data.availableTags || []);

	function toggleExcludedTag(tag: string) {
		if (defaultExcludedTags.includes(tag)) {
			defaultExcludedTags = defaultExcludedTags.filter((t) => t !== tag);
		} else {
			defaultExcludedTags = [...defaultExcludedTags, tag];
		}
	}

	const languageOptions: { value: SupportedLanguage; label: string }[] = [
		{ value: 'en', label: '🇬🇧 English' },
		{ value: 'de', label: '🇩🇪 Deutsch' },
		{ value: 'fr', label: '🇫🇷 Français' },
		{ value: 'et', label: '🇪🇪 Eesti' },
		{ value: 'es', label: '🇪🇸 Español' },
		{ value: 'it', label: '🇮🇹 Italiano' },
		{ value: 'pt', label: '🇵🇹 Português' },
		{ value: 'nl', label: '🇳🇱 Nederlands' },
		{ value: 'el', label: '🇬🇷 Ελληνικά' },
		{ value: 'ja', label: '🇯🇵 日本語' },
	];

	const languageTriggerContent = $derived(
		languageOptions.find((lang) => lang.value === settings.language)?.label ??
			'Select a language'
	);

	$effect(() => {
		if (form?.success) {
			isSaving = false;
			settings = form.settings;
			searchMaxTotalHitsUnlimited = settings.searchMaxTotalHits === null;
			searchMaxTotalHitsValue = settings.searchMaxTotalHits ?? 1000;
			defaultExcludedTags = settings.defaultExcludedTags ?? [];
			setAlert({
				type: 'success',
				title: 'Settings Updated',
				message: 'Your changes have been saved successfully.',
				duration: 3000,
				show: true,
			});
		} else if (form?.message) {
			isSaving = false;
			setAlert({
				type: 'error',
				title: 'Update Failed',
				message: form.message,
				duration: 5000,
				show: true,
			});
		}
	});
</script>

<svelte:head>
	<title>{$t('app.system_settings.title')} - OpenArchiver</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold">{$t('app.system_settings.system_settings')}</h1>
		<p class="text-muted-foreground">{$t('app.system_settings.description')}</p>
	</div>

	<form method="POST" class="space-y-8" onsubmit={() => (isSaving = true)}>
		<Card.Root>
			<Card.Content class="space-y-4">
				<!-- Hide language setting for now -->
				<div class="grid gap-2">
					<Label.Root class="mb-1" for="language"
						>{$t('app.system_settings.language')}</Label.Root
					>
					<Select.Root name="language" bind:value={settings.language} type="single">
						<Select.Trigger class="w-[280px]">
							{languageTriggerContent}
						</Select.Trigger>
						<Select.Content>
							{#each languageOptions as lang}
								<Select.Item value={lang.value}>{lang.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="grid gap-2">
					<Label.Root class="mb-1">{$t('app.system_settings.default_theme')}</Label.Root>
					<RadioGroup.Root
						bind:value={settings.theme}
						name="theme"
						class="flex items-center gap-4"
					>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="light" id="light" />
							<Label.Root for="light">{$t('app.system_settings.light')}</Label.Root>
						</div>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="dark" id="dark" />
							<Label.Root for="dark">{$t('app.system_settings.dark')}</Label.Root>
						</div>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="system" id="system" />
							<Label.Root for="system">{$t('app.system_settings.system')}</Label.Root>
						</div>
					</RadioGroup.Root>
				</div>

				<div class="grid gap-2">
					<Label.Root class="mb-1" for="supportEmail"
						>{$t('app.system_settings.support_email')}</Label.Root
					>
					<Input
						id="supportEmail"
						name="supportEmail"
						type="email"
						placeholder="support@example.com"
						bind:value={settings.supportEmail}
						class="max-w-sm"
					/>
				</div>

				<div class="grid gap-2">
					<Label.Root class="mb-1" for="searchMaxTotalHits"
						>{$t('app.system_settings.search_max_results')}</Label.Root
					>
					<p class="text-muted-foreground text-sm">
						{$t('app.system_settings.search_max_results_description')}
					</p>
					<div class="flex items-center gap-4">
						<Input
							id="searchMaxTotalHits"
							name="searchMaxTotalHits"
							type="number"
							min="100"
							max="10000000"
							placeholder="1000"
							bind:value={searchMaxTotalHitsValue}
							disabled={searchMaxTotalHitsUnlimited}
							class="max-w-[150px]"
						/>
						<div class="flex items-center gap-2">
							<Checkbox
								id="searchMaxTotalHitsUnlimited"
								bind:checked={searchMaxTotalHitsUnlimited}
							/>
							<input
								type="hidden"
								name="searchMaxTotalHitsUnlimited"
								value={searchMaxTotalHitsUnlimited ? 'true' : 'false'}
							/>
							<Label.Root for="searchMaxTotalHitsUnlimited" class="cursor-pointer">
								{$t('app.system_settings.search_max_results_unlimited')}
							</Label.Root>
						</div>
					</div>
				</div>

				<div class="grid gap-2">
					<Label.Root class="mb-1" for="defaultExcludedTags"
						>{$t('app.system_settings.default_excluded_tags')}</Label.Root
					>
					<p class="text-muted-foreground text-sm">
						{$t('app.system_settings.default_excluded_tags_description')}
					</p>
					<input
						type="hidden"
						name="defaultExcludedTags"
						value={defaultExcludedTags.join(',')}
					/>
					{#if availableTags.length > 0}
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								<Button variant="outline" class="max-w-sm justify-between">
									<span class="truncate">
										{#if defaultExcludedTags.length === 0}
											{$t(
												'app.system_settings.default_excluded_tags_placeholder'
											)}
										{:else}
											{defaultExcludedTags.length} tag{defaultExcludedTags.length >
											1
												? 's'
												: ''} selected
										{/if}
									</span>
									<ChevronDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
								</Button>
							</DropdownMenu.Trigger>
							<DropdownMenu.Content class="max-h-64 w-56 overflow-y-auto">
								{#each availableTags as tagItem (tagItem.tag)}
									<DropdownMenu.CheckboxItem
										checked={defaultExcludedTags.includes(tagItem.tag)}
										onCheckedChange={() => toggleExcludedTag(tagItem.tag)}
									>
										<span class="flex-1 truncate">{tagItem.tag}</span>
										<span class="text-muted-foreground ml-2 text-xs">
											({tagItem.count})
										</span>
									</DropdownMenu.CheckboxItem>
								{/each}
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					{:else}
						<p class="text-muted-foreground text-sm italic">
							{$t('app.system_settings.no_tags_available')}
						</p>
					{/if}
				</div>
			</Card.Content>
			<Card.Footer class="border-t px-6 py-4">
				<Button type="submit" disabled={isSaving}>
					{#if isSaving}
						{$t('app.system_settings.saving')}...
					{:else}
						{$t('app.system_settings.save_changes')}
					{/if}
				</Button>
			</Card.Footer>
		</Card.Root>
	</form>
</div>
