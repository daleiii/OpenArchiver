<script lang="ts">
	import type { PageData } from './$types';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { MoreHorizontal, Trash, RefreshCw, Loader2, ExternalLink, Check } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Switch } from '$lib/components/ui/switch';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import IngestionSourceForm from '$lib/components/custom/IngestionSourceForm.svelte';
	import { api } from '$lib/api.client';
	import type { IngestionSource, CreateIngestionSourceDto } from '@open-archiver/types';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte';
	import * as HoverCard from '$lib/components/ui/hover-card/index.js';
	import { t } from '$lib/translations';
	let { data }: { data: PageData } = $props();

	let ingestionSources = $state(data.ingestionSources);
	let isDialogOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
	let selectedSource = $state<IngestionSource | null>(null);
	let sourceToDelete = $state<IngestionSource | null>(null);
	let isDeleting = $state(false);
	let selectedIds = $state<string[]>([]);
	let isBulkDeleteDialogOpen = $state(false);

	// Gmail OAuth state
	let isGmailAuthDialogOpen = $state(false);
	let gmailAuthData = $state<{
		authUrl: string;
		sourceId: string;
	} | null>(null);
	let gmailAuthStatus = $state<'pending' | 'submitting' | 'success' | 'error'>('pending');
	let gmailAuthMessage = $state('');
	let gmailAuthCode = $state('');

	const openCreateDialog = () => {
		selectedSource = null;
		isDialogOpen = true;
	};

	const openEditDialog = (source: IngestionSource) => {
		selectedSource = source;
		isDialogOpen = true;
	};

	const openDeleteDialog = (source: IngestionSource) => {
		sourceToDelete = source;
		isDeleteDialogOpen = true;
	};

	const confirmDelete = async () => {
		if (!sourceToDelete) return;
		isDeleting = true;
		try {
			const res = await api(`/ingestion-sources/${sourceToDelete.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const errorBody = await res.json();
				setAlert({
					type: 'error',
					title: 'Failed to delete ingestion',
					message: errorBody.message || JSON.stringify(errorBody),
					duration: 5000,
					show: true,
				});
				return;
			}
			ingestionSources = ingestionSources.filter((s) => s.id !== sourceToDelete!.id);
			isDeleteDialogOpen = false;
			sourceToDelete = null;
		} finally {
			isDeleting = false;
		}
	};

	const handleSync = async (id: string) => {
		const res = await api(`/ingestion-sources/${id}/sync`, { method: 'POST' });
		if (!res.ok) {
			const errorBody = await res.json();
			setAlert({
				type: 'error',
				title: 'Failed to trigger force sync ingestion',
				message: errorBody.message || JSON.stringify(errorBody),
				duration: 5000,
				show: true,
			});
			return;
		}
		const updatedSources = ingestionSources.map((s) => {
			if (s.id === id) {
				return { ...s, status: 'syncing' as const };
			}
			return s;
		});
		ingestionSources = updatedSources;
	};

	const handleToggle = async (source: IngestionSource) => {
		try {
			const isPaused = source.status === 'paused';
			const newStatus = isPaused ? 'active' : 'paused';
			if (newStatus === 'paused') {
				const response = await api(`/ingestion-sources/${source.id}/pause`, {
					method: 'POST',
				});
				const responseText = await response.json();
				if (!response.ok) {
					throw Error(responseText.message || 'Operation failed');
				}
			} else {
				const response = await api(`/ingestion-sources/${source.id}`, {
					method: 'PUT',
					body: JSON.stringify({ status: 'active' }),
				});
				const responseText = await response.json();
				if (!response.ok) {
					throw Error(responseText.message || 'Operation failed');
				}
			}

			ingestionSources = ingestionSources.map((s) => {
				if (s.id === source.id) {
					return { ...s, status: newStatus };
				}
				return s;
			});
		} catch (e) {
			setAlert({
				type: 'error',
				title: 'Failed to trigger force sync ingestion',
				message: e instanceof Error ? e.message : JSON.stringify(e),
				duration: 5000,
				show: true,
			});
		}
	};

	const handleBulkDelete = async () => {
		isDeleting = true;
		try {
			for (const id of selectedIds) {
				const res = await api(`/ingestion-sources/${id}`, { method: 'DELETE' });
				if (!res.ok) {
					const errorBody = await res.json();
					setAlert({
						type: 'error',
						title: `Failed to delete ingestion ${id}`,
						message: errorBody.message || JSON.stringify(errorBody),
						duration: 5000,
						show: true,
					});
					return;
				}
			}
			ingestionSources = ingestionSources.filter((s) => !selectedIds.includes(s.id));
			selectedIds = [];
			isBulkDeleteDialogOpen = false;
		} finally {
			isDeleting = false;
		}
	};

	const handleBulkForceSync = async () => {
		try {
			for (const id of selectedIds) {
				const res = await api(`/ingestion-sources/${id}/sync`, { method: 'POST' });
				if (!res.ok) {
					const errorBody = await res.json();
					setAlert({
						type: 'error',
						title: `Failed to trigger force sync for ingestion ${id}`,
						message: errorBody.message || JSON.stringify(errorBody),
						duration: 5000,
						show: true,
					});
				}
			}
			const updatedSources = ingestionSources.map((s) => {
				if (selectedIds.includes(s.id)) {
					return { ...s, status: 'syncing' as const };
				}
				return s;
			});
			ingestionSources = updatedSources;
			selectedIds = [];
		} catch (e) {
			setAlert({
				type: 'error',
				title: 'Failed to trigger force sync',
				message: e instanceof Error ? e.message : JSON.stringify(e),
				duration: 5000,
				show: true,
			});
		}
	};

	const startGmailAuth = async (sourceId: string) => {
		try {
			const response = await api(`/auth/gmail/url?sourceId=${sourceId}`);
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to start Gmail authorization');
			}
			const data = await response.json();

			gmailAuthData = {
				authUrl: data.authUrl,
				sourceId,
			};
			gmailAuthStatus = 'pending';
			gmailAuthMessage = '';
			gmailAuthCode = '';
			isGmailAuthDialogOpen = true;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			setAlert({
				type: 'error',
				title: 'Gmail Authorization Failed',
				message,
				duration: 5000,
				show: true,
			});
		}
	};

	const submitGmailCode = async () => {
		if (!gmailAuthData || !gmailAuthCode.trim()) return;

		gmailAuthStatus = 'submitting';

		try {
			const response = await api('/auth/gmail/exchange', {
				method: 'POST',
				body: JSON.stringify({
					sourceId: gmailAuthData.sourceId,
					code: gmailAuthCode.trim(),
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || 'Failed to exchange code');
			}

			gmailAuthStatus = 'success';
			gmailAuthMessage = data.userEmail ? `Connected: ${data.userEmail}` : 'Connected!';

			// Refresh the ingestion sources list
			const sourcesResponse = await api('/ingestion-sources');
			if (sourcesResponse.ok) {
				ingestionSources = await sourcesResponse.json();
			}
		} catch (error) {
			gmailAuthStatus = 'error';
			gmailAuthMessage = error instanceof Error ? error.message : 'Authorization failed';
		}
	};

	const closeGmailAuthDialog = () => {
		isGmailAuthDialogOpen = false;
		gmailAuthData = null;
		gmailAuthCode = '';
	};

	const handleFormSubmit = async (formData: CreateIngestionSourceDto) => {
		try {
			if (selectedSource) {
				// Update
				const response = await api(`/ingestion-sources/${selectedSource.id}`, {
					method: 'PUT',
					body: JSON.stringify(formData),
				});
				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.message || 'Failed to update source.');
				}
				const updatedSource = await response.json();
				ingestionSources = ingestionSources.map((s) =>
					s.id === updatedSource.id ? updatedSource : s
				);
			} else {
				// Create
				const response = await api('/ingestion-sources', {
					method: 'POST',
					body: JSON.stringify(formData),
				});
				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.message || 'Failed to create source.');
				}
				const newSource = await response.json();

				// For Gmail, start the OAuth authorization flow
				if (formData.provider === 'gmail') {
					isDialogOpen = false;
					ingestionSources = [...ingestionSources, newSource];
					await startGmailAuth(newSource.id);
					return;
				}

				ingestionSources = [...ingestionSources, newSource];
			}
			isDialogOpen = false;
		} catch (error) {
			let message = 'An unknown error occurred.';
			if (error instanceof Error) {
				message = error.message;
			}
			setAlert({
				type: 'error',
				title: 'Authentication Failed',
				message,
				duration: 5000,
				show: true,
			});
		}
	};

	function getStatusClasses(status: IngestionSource['status']): string {
		switch (status) {
			case 'active':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
			case 'imported':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
			case 'paused':
				return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
			case 'error':
				return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
			case 'syncing':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
			case 'importing':
				return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
			case 'pending_auth':
				return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
			case 'auth_success':
				return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
		}
	}
</script>

<svelte:head>
	<title>{$t('app.ingestions.title')} - OpenArchiver</title>
</svelte:head>

<div class="">
	<div class="mb-4 flex items-center justify-between">
		<div class="flex items-center gap-4">
			<h1 class="text-2xl font-bold">{$t('app.ingestions.ingestion_sources')}</h1>
			{#if selectedIds.length > 0}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						<Button variant="outline">
							{$t('app.ingestions.bulk_actions')} ({selectedIds.length})
							<MoreHorizontal class="ml-2 h-4 w-4" />
						</Button>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content>
						<DropdownMenu.Item onclick={handleBulkForceSync}>
							<RefreshCw class="mr-2 h-4 w-4" />
							{$t('app.ingestions.force_sync')}
						</DropdownMenu.Item>
						<DropdownMenu.Item
							class="text-red-600"
							onclick={() => (isBulkDeleteDialogOpen = true)}
						>
							<Trash class="mr-2 h-4 w-4" />
							{$t('app.ingestions.delete')}
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</div>
		<Button onclick={openCreateDialog}>{$t('app.ingestions.create_new')}</Button>
	</div>

	<div class="rounded-md border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-12">
						<Checkbox
							onCheckedChange={(checked) => {
								if (checked) {
									selectedIds = ingestionSources.map((s) => s.id);
								} else {
									selectedIds = [];
								}
							}}
							checked={ingestionSources.length > 0 &&
							selectedIds.length === ingestionSources.length
								? true
								: ((selectedIds.length > 0 ? 'indeterminate' : false) as any)}
						/>
					</Table.Head>
					<Table.Head>{$t('app.ingestions.name')}</Table.Head>
					<Table.Head>{$t('app.ingestions.provider')}</Table.Head>
					<Table.Head>{$t('app.ingestions.status')}</Table.Head>
					<Table.Head>{$t('app.ingestions.active')}</Table.Head>
					<Table.Head>{$t('app.ingestions.created_at')}</Table.Head>
					<Table.Head class="text-right">{$t('app.ingestions.actions')}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if ingestionSources.length > 0}
					{#each ingestionSources as source (source.id)}
						<Table.Row>
							<Table.Cell>
								<Checkbox
									checked={selectedIds.includes(source.id)}
									onCheckedChange={() => {
										if (selectedIds.includes(source.id)) {
											selectedIds = selectedIds.filter(
												(id) => id !== source.id
											);
										} else {
											selectedIds = [...selectedIds, source.id];
										}
									}}
								/>
							</Table.Cell>
							<Table.Cell>
								<a
									class="link"
									href="/dashboard/archived-emails?ingestionSourceId={source.id}"
									>{source.name}</a
								>
							</Table.Cell>
							<Table.Cell class="capitalize"
								>{source.provider.split('_').join(' ')}</Table.Cell
							>
							<Table.Cell class="min-w-24">
								<HoverCard.Root>
									<HoverCard.Trigger>
										<Badge
											class="{getStatusClasses(
												source.status
											)} cursor-pointer capitalize"
										>
											{source.status.split('_').join(' ')}
										</Badge>
									</HoverCard.Trigger>
									<HoverCard.Content class="{getStatusClasses(source.status)} ">
										<div class="flex flex-col space-y-4 text-sm">
											<p class=" font-mono">
												<b>{$t('app.ingestions.last_sync_message')}:</b>
												{source.lastSyncStatusMessage ||
													$t('app.ingestions.empty')}
											</p>
										</div>
									</HoverCard.Content>
								</HoverCard.Root>
							</Table.Cell>
							<Table.Cell>
								<Switch
									id={`active-switch-${source.id}`}
									class="cursor-pointer"
									checked={source.status !== 'paused'}
									onCheckedChange={() => handleToggle(source)}
									disabled={source.status === 'importing' ||
										source.status === 'syncing'}
								/>
							</Table.Cell>
							<Table.Cell
								>{new Date(source.createdAt).toLocaleDateString()}</Table.Cell
							>
							<Table.Cell class="text-right">
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										<Button variant="ghost" class="h-8 w-8 p-0">
											<span class="sr-only"
												>{$t('app.ingestions.open_menu')}</span
											>
											<MoreHorizontal class="h-4 w-4" />
										</Button>
									</DropdownMenu.Trigger>
									<DropdownMenu.Content>
										<DropdownMenu.Label
											>{$t('app.ingestions.actions')}</DropdownMenu.Label
										>
										<DropdownMenu.Item onclick={() => openEditDialog(source)}
											>{$t('app.ingestions.edit')}</DropdownMenu.Item
										>
										<DropdownMenu.Item onclick={() => handleSync(source.id)}
											>{$t('app.ingestions.force_sync')}</DropdownMenu.Item
										>
										{#if source.provider === 'gmail'}
											<DropdownMenu.Item onclick={() => startGmailAuth(source.id)}
												>{$t('app.ingestions.reconnect')}</DropdownMenu.Item
											>
										{/if}
										<DropdownMenu.Separator />
										<DropdownMenu.Item
											class="text-red-600"
											onclick={() => openDeleteDialog(source)}
											>{$t('app.ingestions.delete')}</DropdownMenu.Item
										>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				{:else}
					<Table.Row>
						<Table.Cell class="h-8 text-center"></Table.Cell>
					</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
	</div>
</div>

<Dialog.Root bind:open={isDialogOpen}>
	<Dialog.Content
		class="sm:max-w-120 md:max-w-180"
		onInteractOutside={(e) => {
			e.preventDefault();
		}}
	>
		<Dialog.Header>
			<Dialog.Title
				>{selectedSource ? $t('app.ingestions.edit') : $t('app.ingestions.create')}{' '}
				{$t('app.ingestions.ingestion_source')}</Dialog.Title
			>
			<Dialog.Description>
				{selectedSource
					? $t('app.ingestions.edit_description')
					: $t('app.ingestions.create_description')}
				<span
					>{$t('app.ingestions.read')}{' '}
					<a
						class="text-primary underline underline-offset-2"
						target="_blank"
						href="https://docs.openarchiver.com/user-guides/email-providers/"
						>{$t('app.ingestions.docs_here')}</a
					>.</span
				>
			</Dialog.Description>
		</Dialog.Header>
		<IngestionSourceForm source={selectedSource} onSubmit={handleFormSubmit} />
	</Dialog.Content>
</Dialog.Root>

<!-- Gmail OAuth Authorization Dialog -->
<Dialog.Root
	bind:open={isGmailAuthDialogOpen}
	onOpenChange={(open) => !open && closeGmailAuthDialog()}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Connect Gmail Account</Dialog.Title>
			<Dialog.Description>
				{#if gmailAuthStatus === 'pending' || gmailAuthStatus === 'submitting'}
					Follow the steps below to connect your Gmail account.
				{:else if gmailAuthStatus === 'success'}
					Your Gmail account has been connected successfully!
				{:else}
					Authorization failed. Please try again.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		{#if (gmailAuthStatus === 'pending' || gmailAuthStatus === 'submitting') && gmailAuthData}
			<div class="space-y-4">
				<div class="space-y-2">
					<p class="text-sm font-medium">Step 1: Open Google Authorization</p>
					<p class="text-muted-foreground text-sm">
						Click the button below to sign in with Google. After authorizing, you'll be
						redirected to a page that won't load - this is expected.
					</p>
					<Button
						variant="default"
						onclick={() => window.open(gmailAuthData?.authUrl, '_blank')}
						class="w-full"
					>
						<ExternalLink class="mr-2 h-4 w-4" />
						Sign in with Google
					</Button>
				</div>

				<div class="space-y-2">
					<p class="text-sm font-medium">Step 2: Copy the code from the URL</p>
					<p class="text-muted-foreground text-sm">
						After authorizing, copy the <code class="bg-muted rounded px-1">code=</code>
						value from your browser's address bar and paste it below.
					</p>
					<div
						class="text-muted-foreground bg-muted break-all rounded p-2 font-mono text-xs"
					>
						http://localhost:4000/...?code=<span class="text-primary font-bold"
							>4/0XXXXX...</span
						>&scope=...
					</div>
				</div>

				<div class="space-y-2">
					<p class="text-sm font-medium">Step 3: Paste the code</p>
					<Input
						type="text"
						placeholder="Paste the code here (starts with 4/0...)"
						bind:value={gmailAuthCode}
						disabled={gmailAuthStatus === 'submitting'}
					/>
				</div>
			</div>
		{:else if gmailAuthStatus === 'success'}
			<div class="py-4 text-center">
				<div
					class="flex items-center justify-center gap-2 text-lg font-medium text-green-600 dark:text-green-400"
				>
					<Check class="h-5 w-5" />
					{gmailAuthMessage}
				</div>
				<p class="text-muted-foreground mt-2 text-sm">
					Email archiving will begin shortly.
				</p>
			</div>
		{:else if gmailAuthStatus === 'error'}
			<div class="py-4 text-center">
				<div class="text-red-600 dark:text-red-400">
					{gmailAuthMessage}
				</div>
			</div>
		{/if}

		<Dialog.Footer>
			{#if gmailAuthStatus === 'pending' || gmailAuthStatus === 'submitting'}
				<Button
					variant="default"
					onclick={submitGmailCode}
					disabled={!gmailAuthCode.trim() || gmailAuthStatus === 'submitting'}
				>
					{#if gmailAuthStatus === 'submitting'}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						Connecting...
					{:else}
						Connect Account
					{/if}
				</Button>
			{/if}
			<Button variant="outline" onclick={closeGmailAuthDialog}>
				{gmailAuthStatus === 'success' ? 'Done' : 'Cancel'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={isDeleteDialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{$t('app.ingestions.delete_confirmation_title')}</Dialog.Title>
			<Dialog.Description>
				{$t('app.ingestions.delete_confirmation_description')}
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="sm:justify-start">
			<Button
				type="button"
				variant="destructive"
				onclick={confirmDelete}
				disabled={isDeleting}
				>{#if isDeleting}
					{$t('app.ingestions.deleting')}...
				{:else}
					{$t('app.ingestions.confirm')}
				{/if}</Button
			>
			<Dialog.Close>
				<Button type="button" variant="secondary">{$t('app.ingestions.cancel')}</Button>
			</Dialog.Close>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={isBulkDeleteDialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title
				>{$t('app.ingestions.bulk_delete_confirmation_title', {
					count: selectedIds.length,
				} as any)}</Dialog.Title
			>
			<Dialog.Description>
				{$t('app.ingestions.bulk_delete_confirmation_description')}
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="sm:justify-start">
			<Button
				type="button"
				variant="destructive"
				onclick={handleBulkDelete}
				disabled={isDeleting}
				>{#if isDeleting}
					{$t('app.ingestions.deleting')}...
				{:else}
					{$t('app.ingestions.confirm')}
				{/if}</Button
			>
			<Dialog.Close>
				<Button type="button" variant="secondary">{$t('app.ingestions.cancel')}</Button>
			</Dialog.Close>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
