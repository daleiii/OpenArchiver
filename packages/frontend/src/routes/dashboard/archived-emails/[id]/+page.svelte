<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import EmailPreview from '$lib/components/custom/EmailPreview.svelte';
	import EmailThread from '$lib/components/custom/EmailThread.svelte';
	import { api } from '$lib/api.client';
	import { browser } from '$app/environment';
	import { formatBytes } from '$lib/utils';
	import { goto } from '$app/navigation';
	import * as Dialog from '$lib/components/ui/dialog';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte';
	import { t } from '$lib/translations';
	import { ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import * as HoverCard from '$lib/components/ui/hover-card';

	let { data }: { data: PageData } = $props();
	let email = $derived(data.email);
	let integrityReport = $derived(data.integrityReport);
	let isDeleteDialogOpen = $state(false);
	let isDeleting = $state(false);

	async function download(path: string, filename: string) {
		if (!browser) return;

		try {
			const response = await api(`/storage/download?path=${encodeURIComponent(path)}`);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			a.remove();
		} catch (error) {
			console.error('Download failed:', error);
			// Optionally, show an error message to the user
		}
	}

	async function confirmDelete() {
		if (!email) return;
		try {
			isDeleting = true;
			const response = await api(`/archived-emails/${email.id}`, {
				method: 'DELETE',
			});
			if (!response.ok) {
				const errorData = await response.json().catch(() => null);
				const message = errorData?.message || 'Failed to delete email';
				console.error('Delete failed:', message);
				setAlert({
					type: 'error',
					title: 'Failed to delete archived email',
					message: message,
					duration: 5000,
					show: true,
				});
				return;
			}
			await goto('/dashboard/archived-emails', { invalidateAll: true });
		} catch (error) {
			console.error('Delete failed:', error);
		} finally {
			isDeleting = false;
			isDeleteDialogOpen = false;
		}
	}
</script>

<svelte:head>
	<title>{email?.subject} | {$t('app.archive.title')} - OpenArchiver</title>
</svelte:head>

{#if email}
	<div class="grid grid-cols-3 gap-6">
		<!-- Left column: Email preview only -->
		<div class="col-span-3 md:col-span-2">
			<Card.Root>
				<Card.Header>
					<Card.Title>{$t('app.archive.email_preview')}</Card.Title>
				</Card.Header>
				<Card.Content>
					<EmailPreview raw={email.raw} />
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Right column: All metadata and actions -->
		<div class="col-span-3 space-y-6 md:col-span-1">
			<!-- Subject -->
			<Card.Root>
				<Card.Header class="pb-0">
					<Card.Title class="text-lg">{$t('app.archive.subject')}</Card.Title>
				</Card.Header>
				<Card.Content class="pt-2">
					<p class="text-foreground">{email.subject || $t('app.archive.no_subject')}</p>
				</Card.Content>
			</Card.Root>

			<!-- Participants -->
			<Card.Root>
				<Card.Header class="pb-0">
					<Card.Title class="text-lg">{$t('app.archive.participants')}</Card.Title>
				</Card.Header>
				<Card.Content class="pt-2">
					<dl class="text-muted-foreground space-y-2 text-sm">
						<div class="flex gap-2">
							<dt class="text-foreground w-12 flex-shrink-0 font-medium">{$t('app.archive.from')}:</dt>
							<dd class="min-w-0 break-words">{email.senderEmail || email.senderName}</dd>
						</div>
						<div class="flex gap-2">
							<dt class="text-foreground w-12 flex-shrink-0 font-medium">{$t('app.archive.to')}:</dt>
							<dd class="min-w-0 break-words">
								{email.recipients.filter((r) => r.email).map((r) => r.email || r.name).join(', ') || '-'}
							</dd>
						</div>
						{#if email.recipients.some((r) => r.email && r.name === 'cc')}
							<div class="flex gap-2">
								<dt class="text-foreground w-12 flex-shrink-0 font-medium">CC:</dt>
								<dd class="min-w-0 break-words">
									{email.recipients.filter((r) => r.name === 'cc').map((r) => r.email).join(', ')}
								</dd>
							</div>
						{/if}
					</dl>
				</Card.Content>
			</Card.Root>

			<!-- Email Thread -->
			{#if email.thread && email.thread.length > 1}
				<Card.Root>
					<Card.Header class="pb-0">
						<Card.Title class="text-lg">{$t('app.archive.email_thread')}</Card.Title>
					</Card.Header>
					<Card.Content class="pt-2">
						<EmailThread thread={email.thread} currentEmailId={email.id} />
					</Card.Content>
				</Card.Root>
			{/if}

			<!-- Details -->
			<Card.Root>
				<Card.Header class="pb-0">
					<Card.Title class="text-lg">{$t('app.archive.details')}</Card.Title>
				</Card.Header>
				<Card.Content class="pt-2">
					<dl class="text-muted-foreground space-y-2 text-sm">
						<div class="flex gap-2">
							<dt class="text-foreground w-16 flex-shrink-0 font-medium">{$t('app.archive.sent')}:</dt>
							<dd>{new Date(email.sentAt).toLocaleString()}</dd>
						</div>
						{#if email.path}
							<div class="flex gap-2">
								<dt class="text-foreground w-16 flex-shrink-0 font-medium">{$t('app.archive.folder')}:</dt>
								<dd>{email.path}</dd>
							</div>
						{/if}
						{#if email.tags && email.tags.length > 0}
							<div class="flex gap-2">
								<dt class="text-foreground w-16 flex-shrink-0 font-medium">{$t('app.archive.tags')}:</dt>
								<dd class="flex flex-wrap gap-1">
									{#each email.tags as tag}
										<button
											type="button"
											onclick={() =>
												goto(
													`/dashboard/search?keywords=*&tags=${encodeURIComponent(tag)}`
												)}
											class="bg-muted hover:bg-muted/80 cursor-pointer rounded px-1.5 py-0.5 text-xs"
										>
											{tag}
										</button>
									{/each}
								</dd>
							</div>
						{/if}
						<div class="flex gap-2">
							<dt class="text-foreground w-16 flex-shrink-0 font-medium">{$t('app.archive.size')}:</dt>
							<dd>{formatBytes(email.sizeBytes)}</dd>
						</div>
						{#if email.threadId}
							<div class="flex gap-2">
								<dt class="text-foreground w-16 flex-shrink-0 font-medium">{$t('app.archive.thread')}:</dt>
								<dd>
									<a
										href="/dashboard/search?keywords=*&threadId={encodeURIComponent(email.threadId)}"
										class="text-primary hover:underline"
									>
										{$t('app.archive.view_thread')}
									</a>
								</dd>
							</div>
						{/if}
					</dl>
				</Card.Content>
			</Card.Root>

			<!-- Attachments -->
			{#if email.attachments && email.attachments.length > 0}
				<Card.Root>
					<Card.Header class="pb-0">
						<Card.Title class="text-lg">{$t('app.archive.attachments')}</Card.Title>
					</Card.Header>
					<Card.Content class="pt-2">
						<ul class="space-y-2">
							{#each email.attachments as attachment}
								<li class="flex items-center justify-between gap-2">
									<span class="min-w-0 truncate text-sm">
										{attachment.filename}
										<span class="text-muted-foreground">({formatBytes(attachment.sizeBytes)})</span>
									</span>
									<Button
										variant="outline"
										size="sm"
										onclick={() => download(attachment.storagePath, attachment.filename)}
									>
										{$t('app.archive.download')}
									</Button>
								</li>
							{/each}
						</ul>
					</Card.Content>
				</Card.Root>
			{/if}

			<!-- Actions -->
			<Card.Root>
				<Card.Header class="pb-0">
					<Card.Title class="text-lg">{$t('app.archive.actions')}</Card.Title>
				</Card.Header>
				<Card.Content class="pt-2 space-y-2">
					<Button
						class="w-full"
						onclick={() => download(email.storagePath, `${email.subject || 'email'}.eml`)}
					>
						{$t('app.archive.download_eml')}
					</Button>
					<Button class="w-full" variant="destructive" onclick={() => (isDeleteDialogOpen = true)}>
						{$t('app.archive.delete_email')}
					</Button>
				</Card.Content>
			</Card.Root>

			<!-- Integrity Report -->
			{#if integrityReport && integrityReport.length > 0}
				<Card.Root>
					<Card.Header class="pb-0">
						<Card.Title class="text-lg">{$t('app.archive.integrity_report')}</Card.Title>
						<Card.Description>
							<span class="mt-1">
								{$t('app.archive.integrity_report_description')}
								<a
									href="https://docs.openarchiver.com/user-guides/integrity-check.html"
									target="_blank"
									class="text-primary underline underline-offset-2"
								>
									{$t('app.common.read_docs')}
								</a>.
							</span>
						</Card.Description>
					</Card.Header>
					<Card.Content class="pt-2 space-y-2">
						<ul class="space-y-2">
							{#each integrityReport as item}
								<li class="flex items-center justify-between">
									<div class="flex min-w-0 flex-row items-center space-x-2">
										{#if item.isValid}
											<ShieldCheck class="h-4 w-4 flex-shrink-0 text-green-500" />
										{:else}
											<ShieldAlert class="h-4 w-4 flex-shrink-0 text-red-500" />
										{/if}
										<div class="min-w-0 max-w-64">
											<p class="truncate text-sm font-medium">
												{#if item.type === 'email'}
													{$t('app.archive.email_eml')}
												{:else}
													{item.filename}
												{/if}
											</p>
										</div>
									</div>
									{#if item.isValid}
										<Badge variant="default" class="bg-green-500">
											{$t('app.archive.valid')}
										</Badge>
									{:else}
										<HoverCard.Root>
											<HoverCard.Trigger>
												<Badge variant="destructive" class="cursor-help">
													{$t('app.archive.invalid')}
												</Badge>
											</HoverCard.Trigger>
											<HoverCard.Content class="w-80 bg-gray-50 text-red-500 dark:bg-gray-800">
												<p>{item.reason}</p>
											</HoverCard.Content>
										</HoverCard.Root>
									{/if}
								</li>
							{/each}
						</ul>
					</Card.Content>
				</Card.Root>
			{:else}
				<Alert.Root variant="destructive">
					<AlertTriangle class="h-4 w-4" />
					<Alert.Title>{$t('app.archive.integrity_check_failed_title')}</Alert.Title>
					<Alert.Description>
						{$t('app.archive.integrity_check_failed_message')}
					</Alert.Description>
				</Alert.Root>
			{/if}
		</div>
	</div>

	<Dialog.Root bind:open={isDeleteDialogOpen}>
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>{$t('app.archive.delete_confirmation_title')}</Dialog.Title>
				<Dialog.Description>
					{$t('app.archive.delete_confirmation_description')}
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer class="sm:justify-start">
				<Button
					type="button"
					variant="destructive"
					onclick={confirmDelete}
					disabled={isDeleting}
				>
					{#if isDeleting}
						{$t('app.archive.deleting')}...
					{:else}
						{$t('app.archive.confirm')}
					{/if}
				</Button>
				<Dialog.Close>
					<Button type="button" variant="secondary">{$t('app.archive.cancel')}</Button>
				</Dialog.Close>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<p>{$t('app.archive.not_found')}</p>
{/if}
