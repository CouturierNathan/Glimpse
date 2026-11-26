import { walletMessages } from '../wallet-messages.ts'

/*
 * Every word the app shows, in English and French. Components read them through `useI18n()` (or
 * `<T k="…" />` in server pages); nothing on screen is written inline. `{name}` is replaced by the
 * value of the same name.
 */

const en = {
  // Shell
  'meta.description': 'Reveal less. Prove more.',
  'nav.label': 'Main',
  'nav.vault': 'Vault',
  'nav.import': 'Import',
  'nav.requests': 'Requests',
  'nav.verify': 'Verify',
  'nav.issue': 'Issue',
  'nav.home': 'Glimpse, home',
  'lang.label': 'Language',
  'account.signIn': 'Sign in',
  'account.signOut': 'Sign out',
  'account.address': 'Signed in as {address}',
  'who.holder': 'You, the holder',
  'who.organisation': 'An organisation',
  'who.requester': 'A requester',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.cancel': 'Cancel',
  'common.tryAgain': 'Try again',
  'common.loading': 'Loading…',
  'common.you': '(you)',
  'notFound.title': 'This page does not exist',
  'notFound.text': 'The link may be wrong, or the request may have been removed.',
  'notFound.cta': 'Back to the home page',

  // Page titles
  'title.home': 'Glimpse',
  'title.vault': 'Vault',
  'title.import': 'Import',
  'title.requests': 'Requests',
  'title.request': 'Request',
  'title.verify': 'Verify',
  'title.issue': 'Issue',
  'title.signIn': 'Sign in',

  // Home
  'home.title': 'Reveal less. Prove more.',
  'home.lede':
    'Glimpse is an encrypted vault for your personal attestations. You hold the keys, and you share one piece of information at a time, only when you agree.',
  'home.cta': 'Sign in with Ethereum',
  'home.ctaSignedIn': 'Open my vault',
  'home.doc.label': 'Example: an attestation where only one line is shared',
  'home.doc.title': 'Identity attestation',
  'home.doc.shared': 'Shared with a requester',
  'home.doc.fullName': 'Full name',
  'home.doc.birth': 'Date of birth',
  'home.doc.address': 'Home address',
  'home.doc.hidden': 'hidden',
  'home.doc.over18': 'Over 18',
  'home.doc.foot': 'Signed by the issuer, checked on chain by the requester.',
  'home.step1.title': 'An organisation signs',
  'home.step1.text':
    'Your school, bank or employer certifies a fact about you and records it on chain.',
  'home.step2.title': 'You keep it encrypted',
  'home.step2.text': 'It lands in your vault. Only your wallet holds the key that opens it.',
  'home.step3.title': 'You share one line',
  'home.step3.text':
    'A requester asks for one piece of information. You agree, and they check it themselves.',

  // Sign in
  'signIn.title': 'Sign in with your wallet',
  'signIn.lede':
    'No password and no account to create. Your address is your identity, and your key never leaves your wallet.',
  'signIn.step1.title': 'Connect your wallet',
  'signIn.step1.text': 'MetaMask or any browser wallet.',
  'signIn.step2.title': 'Sign the message',
  'signIn.step2.text': 'It proves the address is yours. No transaction, no fees.',
  'signIn.button': 'Connect wallet and sign in',
  'signIn.busy': 'Check your wallet…',

  // Statuses
  'status.authentic': 'Authentic',
  'status.authentic.meaning':
    'An organisation signed it, and the chain confirms the signature, the content and that it is still valid.',
  'status.declared': 'Declared',
  'status.declared.meaning':
    'Read from a document you added. No organisation vouches for it on chain.',
  'status.expired': 'Expired',
  'status.expired.meaning': 'Signed by an organisation, but past the end date it set.',
  'status.revoked': 'Revoked',
  'status.revoked.meaning': 'The organisation withdrew it. It no longer proves anything.',
  'status.undetermined': 'Undetermined',
  'status.undetermined.meaning':
    'Not checked against the chain yet, or the chain could not be read.',

  // History
  'history.title': 'Your requests',
  'history.text':
    'What you were asked and what you asked for, from this browser. Kept here, never on the server.',
  'history.received': 'Received',
  'history.sent': 'Sent',
  'history.asked': 'Asked for',
  'history.shared': 'Shared',
  'history.nothing': 'Nothing',
  'history.on': 'Asked on',
  'history.until': 'Open until',
  'history.expired': 'Expired on',
  'history.details': 'Details',
  'history.loading': 'Reading your requests…',
  'history.empty': 'Nothing yet. A request you open or create appears here.',

  // Sources
  'source.A': 'Declared',
  'source.A.title': 'Declared by you',
  'source.A.text': 'Read from a document you added, or entered by you. Nobody else vouches for it.',
  'source.B': 'From a document',
  'source.B.title': 'From a checked document',
  'source.B.text':
    'Read from a document whose origin Glimpse could check. That does not make it authentic: no organisation stands behind the value itself.',
  'source.C': 'Authentic',
  'source.C.title': 'Authentic, attested by an organisation',
  'source.C.text':
    'An organisation signed this information and recorded it on chain. It is the only kind a requester can verify end to end.',

  // Attributes
  'cat.identity': 'Identity',
  'cat.address': 'Address',
  'cat.education': 'Education',
  'cat.work': 'Work and income',
  'attr.full_name': 'Full name',
  'attr.date_of_birth': 'Date of birth',
  'attr.age': 'Age',
  'attr.nationality': 'Nationality',
  'attr.over_18': 'Over 18',
  'attr.address': 'Street address',
  'attr.postal_code': 'Postal code',
  'attr.city': 'City',
  'attr.country': 'Country',
  'attr.student_status': 'Student status',
  'attr.school': 'School',
  'attr.study_level': 'Study level',
  'attr.exam_score': 'Exam score',
  'attr.graduation_year': 'Graduation year',
  'attr.employment_status': 'Employment status',
  'attr.employer': 'Employer',
  'attr.job_title': 'Job title',
  'attr.contract_type': 'Contract type',
  'attr.annual_salary': 'Annual salary (EUR)',

  // Vault
  'vault.lede':
    'Your information, each item marked with where it comes from. Only you can open it, and you share it through the requests you receive.',
  'vault.storage.title': 'Temporary storage',
  'vault.storage.text':
    'Your data stays encrypted, but is automatically deleted when the server restarts.',
  'vault.empty.title': 'Your vault is empty',
  'vault.empty.text':
    'Import a document or an attestation from an organisation to add your first information.',
  'vault.empty.cta': 'Import a document',
  'vault.show': 'Show',
  'vault.hide': 'Hide',
  'vault.delete': 'Delete',
  'vault.decrypting': 'Decrypting…',
  'vault.encrypted': 'Encrypted',
  'vault.itemError':
    'This item could not be opened or deleted. It may have been changed on the server.',
  'vault.keyHint':
    'Your encryption keys stay in this browser and never leave it. Signing out deletes them from here.',
  'vault.statusTitle': 'What each status means',
  'vault.sourcesTitle': 'Where your information comes from',
  'vault.count': '{count} items',
  'vault.countOne': '1 item',
  'attestation.title': 'Add an attestation from an organisation',
  'attestation.button': 'Choose an attestation file',
  'attestation.hint':
    'The .json file an organisation sent you. It is encrypted here before it is stored.',
  'attestation.busy': 'Encrypting in this browser…',
  'attestation.done': 'Added to your vault.',
  'attestation.error': 'The attestation could not be stored. Try again.',
  'attestation.locked': 'Verify your identity before adding an attestation.',

  // Identity
  'identity.required.title': 'Verify your identity first',
  'identity.required.text':
    'Importing documents and adding attestations require a verified identity. It takes a minute with the PDF from the France Identité app.',
  'identity.required.cta': 'Verify my identity',
  'identity.verified': 'Identity verified',
  'identity.verifiedText': 'France Identité proof checked and linked to your wallet.',
  'identity.checking': 'Checking your identity…',
  'identity.step1': 'Check your proof',
  'identity.step2': 'Link it to your wallet',
  'identity.file': 'France Identité proof',
  'identity.fileButton': 'Choose the PDF',
  'identity.fileHint':
    'The signed PDF from the France Identité app. It is checked on the server, then discarded: it is never stored.',
  'identity.submit': 'Check my proof',
  'identity.submitBusy': 'Checking the signature…',
  'identity.chooseFirst': 'Choose your proof first.',
  'identity.passed': 'Your proof is authentic',
  'identity.passedText': 'One last step: sign with your wallet to link this proof to it.',
  'identity.bindWarning': 'Before you sign',
  'identity.sign': 'Sign with my wallet',
  'identity.signBusy': 'Waiting for your wallet…',
  'identity.failed': 'This proof could not be verified',
  'identity.retry': 'Choose another proof',
  'identity.reason.FORMAT_FAILURE': 'This file is not a signed PDF.',
  'identity.reason.HASH_FAILURE': 'The document was modified after it was signed.',
  'identity.reason.SIG_CRYPTO_FAILURE': 'The signature is invalid.',
  'identity.reason.NO_SIGNING_CERTIFICATE_FOUND': 'The signer’s certificate is missing.',
  'identity.reason.NO_CERTIFICATE_CHAIN_FOUND': 'The signer is not a recognised authority.',
  'identity.reason.OUT_OF_BOUNDS_NO_POE': 'The signer’s certificate has expired.',
  'identity.reason.NOT_YET_VALID': 'The signer’s certificate is not valid yet.',
  'identity.reason.unknown': 'The signature could not be checked.',
  'identity.reason.noName': 'Your surname and given names could not be read from this proof.',
  'identity.warning':
    'This links a validly signed France Identité document to this wallet. It does not prove that the person holding the wallet is the person the document names.',

  // Import
  'import.lede':
    'Verify your identity, then add a document or an organisation’s attestation: Glimpse recognises what it is and runs the right checks.',
  'import.identityTitle': 'Your identity',
  'import.documentTitle': 'Add a document or an attestation',
  'import.locked': 'Available once your identity is verified.',
  'import.file': 'Document',
  'import.fileHint':
    'A PDF or text document in your name (5 MB max), or the .json attestation an organisation sent you.',
  'import.attributes': 'Information to read',
  'import.attributesHint':
    'Only what you tick is read. Whatever the document does not hold is simply left out, never invented.',
  'import.selectAll': 'Tick everything',
  'import.selectNone': 'Untick everything',
  'import.nameRequired': 'Always read, to check the document is in your name.',
  'import.consent':
    'Glimpse may read this document on its server to extract the information above. The text is not kept, and each value is encrypted in this browser before it is saved.',
  'import.submit': 'Read the document',
  'import.reading': 'Reading the document…',
  'import.encrypting': 'Encrypting in your browser…',
  'import.chooseFirst': 'Choose a document first.',
  'import.tickOne': 'Tick at least one item to read.',
  'import.tooMany': 'Choose at most {max} items for one document.',
  'import.consentRequired': 'Tick the box to let Glimpse read this document.',
  'import.failed': 'The import failed, try again.',
  'import.signInAgain': 'Sign in again',
  'import.verifyIdentity': 'Verify my identity',
  'import.review.title': 'Check what was read',
  'import.review.hint':
    'Correct a value or untick it before anything is encrypted. A value you change is stored as your own declaration.',
  'import.review.nameMatched': 'Name matches your verified identity',
  'import.review.none': 'None of the requested information was found in this document.',
  'import.review.keep': 'Keep this value',
  'import.review.value': '{name}: value',
  'import.review.missing': 'Not found in this document: {list}.',
  'import.review.confirm': 'Encrypt and add to my vault',
  'import.review.checkValues': 'Check the values.',
  'import.done.one': '1 item added to your vault',
  'import.done.many': '{count} items added to your vault',
  'import.done.signed':
    'The document’s signature was verified: the values you kept unchanged are marked as coming from a signed document.',
  'import.done.open': 'Open my vault',
  'import.done.another': 'Import another document',

  // File picker
  'file.choose': 'Choose a file',
  'file.none': 'No file chosen',
  'file.aria': '{label}: choose a file',

  // Requests (holder)
  'requests.lede':
    'A requester sends you a link. Open it to see what they ask and why, then choose what to share.',
  'requests.open.title': 'Open a request',
  'requests.open.text': 'A requester sends you a link. Open it directly, or paste it here.',
  'requests.open.label': 'Request link',
  'requests.open.button': 'Open',
  'requests.open.invalid':
    'This is not a Glimpse request link. Ask the requester to send it again.',
  'requests.legend.title': 'What a requester can conclude',
  'requests.legend.text':
    'The requester checks what you share on their own, against the chain, and reaches one of these statuses.',
  'request.title': 'A request for information',
  'request.lede':
    'Read who is asking and why. You choose what to share, piece by piece: the rest of your vault stays closed.',
  'request.loading': 'Loading the request…',
  'request.loadFailed': 'This request could not be loaded.',
  'request.requester': 'Requester',
  'request.asksFor': 'Asks for',
  'request.nothingElse': '{name}, and nothing else',
  'request.because': 'Reason',
  'request.before': 'Answer before',
  'request.noMatch':
    'Your vault has no “{name}” in this browser. Import a document that contains it, then come back to this link.',
  'request.importCta': 'Import a document',
  'request.which': 'What you share',
  'request.decrypting': 'Decrypting…',
  'request.cannotOpen': 'Cannot be opened',
  'request.shareHint':
    'Sharing re-encrypts this one value for the requester, in your browser. They then check it on their own.',
  'request.share': 'Share',
  'request.sharing': 'Sharing…',
  'request.refuse': 'Refuse',
  'request.shared': 'You shared “{name}”',
  'request.allowed': 'Your consent is recorded, but nothing was sent yet',
  'request.withdrawHint':
    'You can withdraw until the requester downloads it. Withdrawing cannot erase a copy they already received.',
  'request.withdraw': 'Withdraw consent',
  'request.closed.refused': 'You refused this request.',
  'request.closed.withdrawn':
    'You withdrew your consent. The requester can no longer download the item.',
  'request.closed.expired': 'This request has expired. Ask the requester for a new link.',
  'request.closed.answered': 'This request has already been answered.',
  'request.failed': 'That did not work, try again.',

  // Verify (requester)
  'verify.lede':
    'Ask someone for one or more pieces of information. No wallet needed: you send a link, they choose what to share, and your browser checks their answer against the chain.',
  'verify.what': 'What to check',
  'verify.why': 'Why you need it',
  'verify.whyPlaceholder': 'Check the exam score for the master’s admission',
  'verify.whyHint': 'The holder reads this before deciding.',
  'verify.submit': 'Create the request',
  'verify.signing': 'Sign in your wallet…',
  'verify.waiting': 'Waiting for the holder',
  'verify.waitingHint':
    'Send this link to the person whose “{name}” you need to check. This page updates when they answer.',
  'verify.link': 'Request link',
  'verify.copy': 'Copy link',
  'verify.copied': 'Copied',
  'verify.checking': 'Checking what the holder shared…',
  'verify.closed.refused': 'The holder refused to share.',
  'verify.closed.expired': 'Nobody answered in time. The request has expired.',
  'verify.closed.withdrawn': 'The holder withdrew their consent before you received the item.',
  'verify.closed.other': 'This request is closed.',
  'verify.failed': 'Verification failed.',
  'verify.restart': 'Ask for something else',
  'verify.checkedAt': 'Checked in this browser against the chain, at {time}.',
  'check.signature': 'Issuer signature',
  'check.provenance': 'Issuer and information',
  'check.integrity': 'Content unchanged',
  'check.validity': 'Within its dates',
  'check.revocation': 'Not revoked',
  'check.replay': 'Request answered once',
  'outcome.pass': 'Passed',
  'outcome.fail': 'Failed',
  'outcome.unknown': 'Not checked',

  // Issue (organisation)
  'issue.lede':
    'For organisations. Sign one piece of information for a holder’s wallet and record it on chain: the holder receives the attestation, the chain only a salted commitment.',
  'issue.locked.text':
    'Issuing an attestation requires a verified identity for the wallet you signed in with.',
  'issue.reading': 'Reading the registries from the chain…',
  'issue.readFailed': 'The registries could not be read from the chain.',
  'issue.register.title': 'Register your organisation',
  'issue.register.hint':
    'Registration is open and public. Your wallet becomes the organisation’s admin and signer. Requesters decide for themselves which organisations they trust.',
  'issue.register.name': 'Organisation name',
  'issue.register.placeholder': 'Epitech Paris',
  'issue.register.submit': 'Register on chain',
  'issue.confirmWallet': 'Confirm in your wallet…',
  'issue.as': 'Issuing as',
  'issue.form.title': 'Issue an attestation',
  'issue.form.holder': 'Holder’s wallet address',
  'issue.form.attribute': 'Information',
  'issue.form.value': 'Value',
  'issue.form.validDays': 'Valid for (days)',
  'issue.form.submit': 'Sign and record',
  'issue.form.busy': 'Sign, then confirm in your wallet…',
  'issue.done.title': 'Attestation recorded',
  'issue.done.hint':
    'Send this file to the holder. It holds the value and its salt: only they should get it. The chain only keeps a salted commitment.',
  'issue.done.download': 'Download the attestation',
  'issue.done.tx': 'See the transaction',
  'issue.done.another': 'Issue another',
  'issue.list.title': 'Issued by your organisation',
  'issue.list.empty': 'Nothing issued yet.',
  'issue.list.dates': '{from} to {to}',
  'issue.list.revoke': 'Revoke',
  'issue.list.hint':
    'The chain keeps only ids, dates and salted commitments: holders and values stay off it.',

  // Final pass
  'form.required': 'Fill in this field.',
  'form.tooLong': '{max} characters at most.',
  'form.number': 'Enter a number.',
  'form.date': 'Enter a valid date.',
  'form.address': 'Enter a wallet address: 0x followed by 40 characters.',
  'form.range': 'Enter a whole number from {min} to {max}.',
  'import.kind.document': 'Document',
  'import.kind.documentText':
    'Glimpse reads the information you tick below and checks the document is in your name. A signed PDF is recognised automatically.',
  'import.kind.attestation': 'Attestation from an organisation',
  'import.kind.attestationText':
    'Glimpse checks it was issued to your wallet, is recorded on chain and is not revoked, then encrypts it in this browser.',
  'import.submitAttestation': 'Check and add to my vault',
  'import.checkingAttestation': 'Checking the attestation…',
  'import.done.attestation':
    'The requester who checks it will see whether it is still valid on chain.',
  'attestation.missing':
    'This attestation is not recorded on the chain. Ask the organisation to record it.',
  'attestation.revoked': 'The organisation revoked this attestation: it no longer proves anything.',
  'issue.gasHint':
    'Recording on chain is a Base Sepolia transaction: your wallet asks you to confirm it and pay a small test-network fee.',
  'issue.list.revokeTitle': 'Revoke this attestation?',
  'issue.list.revokeText': 'Every requester will see it as revoked. This cannot be undone.',
  'vault.add': 'Add',
  'vault.loading': 'Opening your vault…',
  'vault.deleteTitle': 'Delete this item?',
  'vault.deleteText': '“{name}” will be deleted from your vault. This cannot be undone.',
  'vault.shareHint': 'To share an item, open the link a requester sent you in',
  'vault.shareLink': 'Requests',
  'request.declared': 'Name given by the requester, not verified.',
  'request.whichHint':
    'Choose, for each piece, the value to share or “Don’t share”. Nothing else leaves your vault.',
  'request.dontShare': 'Don’t share',
  'request.notInVault': 'Not in your vault.',
  'request.emptyVault':
    'Your vault holds none of the information asked for. Import a document that contains it, then come back to this link.',
  'request.pickOne': 'Choose at least one value to share, or refuse the request.',
  'request.shareSelection': 'Share my selection',
  'request.refuseAll': 'Refuse the request',
  'request.refuseTitle': 'Refuse this request?',
  'request.refuseText': 'The requester will see that you refused. Nothing is shared.',
  'request.withdrawTitle': 'Withdraw your consent?',
  'request.withdrawText':
    'The requester can no longer download what you shared. A copy already received cannot be erased.',
  'request.signIn.title': 'Sign in to answer',
  'request.signIn.text':
    'Reading this request needs no account. To share information, sign in with your wallet: your vault opens in this browser.',
  'request.signIn.cta': 'Sign in to answer',
  'status.title': 'Your request',
  'status.lede':
    'Send the link to the person concerned. Their answers appear here and are checked in your browser.',
  'status.share.title': 'Link to send',
  'status.share.text':
    'Anyone with this link can read what you ask, never a value. Only you, in this browser, can read the answers.',
  'status.answers': 'Answers',
  'status.checks': 'Details of the checks',
  'status.expiredOn': 'Expired on',
  'status.withdrawnAfter': 'The holder has since withdrawn their consent.',
  'status.otherBrowser.title': 'This request is not in this browser',
  'status.otherBrowser.text':
    'Only the browser that created a request can read its answers. Open it there, or create a new one.',
  'status.newRequest': 'New request',
  'state.pending': 'Waiting for an answer',
  'state.refused': 'Refused',
  'state.allowed': 'Being sent',
  'state.shared': 'Shared',
  'state.withdrawn': 'Consent withdrawn',
  'state.expired': 'Expired',
  'state.answered': 'Already answered',
  'verify.name': 'Who is asking',
  'verify.namePlaceholder': 'Epitech admissions',
  'verify.nameHint': 'Your name or your organisation’s, shown to the person you ask.',
  'verify.whatHint':
    'Tick up to {max} pieces of information. The person chooses which ones to share.',
  'verify.pickOne': 'Tick at least one piece of information.',
  'verify.tooMany': 'Tick {max} pieces of information at most.',
  'verify.lifetime': 'Valid for',
  'verify.lifetime.1': '1 hour',
  'verify.lifetime.24': '24 hours',
  'verify.lifetime.168': '7 days',
  'verify.creating': 'Creating the request…',
  'verify.createFailed': 'The request could not be created. Try again.',
  'verify.noWallet':
    'No wallet and no account needed. The request and the keys that read the answers stay in this browser.',
  'verify.mine': 'Your requests in this browser',
  'verify.until': 'Open until {date}',
  'verify.expiredOn': 'Expired on {date}',
  'verify.open': 'Open',
  'verify.forget': 'Forget',
  'verify.forgetTitle': 'Forget this request?',
  'verify.forgetText':
    'Its keys are deleted from this browser: its answers can no longer be read here.',
  'verify.shareSheet': 'Share',
  // Wallet errors
  'wallet.none': 'No browser wallet found. Install MetaMask or another Ethereum wallet.',
  'wallet.cancelled': 'You cancelled the request in your wallet.',
  'wallet.otherAccount': 'Your wallet is on another account than the one you signed in with.',
  'wallet.signInFailed': 'Sign-in failed, try again.',
  'wallet.txFailed': 'The transaction failed on chain.',
  'wallet.signerOnly': 'Sign with the organisation’s signer wallet.',
} as const

export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>

const fr: Messages = {
  'meta.description': 'Révélez moins. Prouvez plus.',
  'nav.label': 'Navigation principale',
  'nav.vault': 'Coffre',
  'nav.import': 'Importer',
  'nav.requests': 'Demandes',
  'nav.verify': 'Vérifier',
  'nav.issue': 'Émettre',
  'nav.home': 'Glimpse, accueil',
  'lang.label': 'Langue',
  'account.signIn': 'Se connecter',
  'account.signOut': 'Se déconnecter',
  'account.address': 'Connecté avec {address}',
  'who.holder': 'Vous, le titulaire',
  'who.organisation': 'Une organisation',
  'who.requester': 'Un vérificateur',
  'common.yes': 'Oui',
  'common.no': 'Non',
  'common.cancel': 'Annuler',
  'common.tryAgain': 'Réessayer',
  'common.loading': 'Chargement…',
  'common.you': '(vous)',
  'notFound.title': 'Cette page n’existe pas',
  'notFound.text': 'Le lien est peut-être erroné, ou la demande a été supprimée.',
  'notFound.cta': 'Retour à l’accueil',

  'title.home': 'Glimpse',
  'title.vault': 'Coffre',
  'title.import': 'Importer',
  'title.requests': 'Demandes',
  'title.request': 'Demande',
  'title.verify': 'Vérifier',
  'title.issue': 'Émettre',
  'title.signIn': 'Connexion',

  'home.title': 'Révélez moins. Prouvez plus.',
  'home.lede':
    'Glimpse est un coffre chiffré pour vos attestations personnelles. Vous gardez les clés, et vous partagez une seule information à la fois, uniquement avec votre accord.',
  'home.cta': 'Se connecter avec Ethereum',
  'home.ctaSignedIn': 'Ouvrir mon coffre',
  'home.doc.label': 'Exemple : une attestation dont une seule ligne est partagée',
  'home.doc.title': 'Attestation d’identité',
  'home.doc.shared': 'Partagée avec un vérificateur',
  'home.doc.fullName': 'Nom complet',
  'home.doc.birth': 'Date de naissance',
  'home.doc.address': 'Adresse',
  'home.doc.hidden': 'masqué',
  'home.doc.over18': 'Majeur',
  'home.doc.foot': 'Signée par l’émetteur, vérifiée sur la blockchain par le vérificateur.',
  'home.step1.title': 'Une organisation signe',
  'home.step1.text':
    'Votre école, votre banque ou votre employeur certifie une information vous concernant et l’inscrit sur la blockchain.',
  'home.step2.title': 'Vous la gardez chiffrée',
  'home.step2.text':
    'Elle arrive dans votre coffre. Seul votre portefeuille détient la clé qui l’ouvre.',
  'home.step3.title': 'Vous partagez une ligne',
  'home.step3.text':
    'Un vérificateur demande une information. Vous acceptez, et il la vérifie lui-même.',

  'signIn.title': 'Connectez-vous avec votre portefeuille',
  'signIn.lede':
    'Ni mot de passe ni compte à créer. Votre adresse est votre identité, et votre clé ne quitte jamais votre portefeuille.',
  'signIn.step1.title': 'Connectez votre portefeuille',
  'signIn.step1.text': 'MetaMask ou tout portefeuille de navigateur.',
  'signIn.step2.title': 'Signez le message',
  'signIn.step2.text': 'Il prouve que l’adresse vous appartient. Aucune transaction, aucun frais.',
  'signIn.button': 'Connecter le portefeuille',
  'signIn.busy': 'Vérifiez votre portefeuille…',

  'status.authentic': 'Authentique',
  'status.authentic.meaning':
    'Une organisation l’a signée, et la blockchain confirme la signature, le contenu et sa validité.',
  'status.declared': 'Déclarée',
  'status.declared.meaning':
    'Lue dans un document que vous avez ajouté. Aucune organisation ne la garantit sur la blockchain.',
  'status.expired': 'Expirée',
  'status.expired.meaning': 'Signée par une organisation, mais sa date de fin est dépassée.',
  'status.revoked': 'Révoquée',
  'status.revoked.meaning': 'L’organisation l’a retirée. Elle ne prouve plus rien.',
  'status.undetermined': 'Indéterminée',
  'status.undetermined.meaning':
    'Pas encore vérifiée sur la blockchain, ou la blockchain n’a pas pu être lue.',

  'history.title': 'Vos demandes',
  'history.text':
    'Ce qu’on vous a demandé et ce que vous avez demandé, depuis ce navigateur. Conservé ici, jamais sur le serveur.',
  'history.received': 'Reçues',
  'history.sent': 'Envoyées',
  'history.asked': 'Demandé',
  'history.shared': 'Partagé',
  'history.nothing': 'Rien',
  'history.on': 'Demandé le',
  'history.until': 'Ouverte jusqu’au',
  'history.expired': 'Expirée le',
  'history.details': 'Détails',
  'history.loading': 'Lecture de vos demandes…',
  'history.empty': 'Rien pour l’instant. Une demande ouverte ou créée apparaîtra ici.',

  'source.A': 'Déclarée',
  'source.A.title': 'Déclarée par vous',
  'source.A.text':
    'Lue dans un document que vous avez ajouté, ou saisie par vos soins. Personne d’autre ne la garantit.',
  'source.B': 'Issue d’un document',
  'source.B.title': 'Issue d’un document vérifié',
  'source.B.text':
    'Lue dans un document dont Glimpse a pu contrôler l’origine. Cela ne la rend pas authentique : aucune organisation ne s’engage sur la valeur elle-même.',
  'source.C': 'Authentique',
  'source.C.title': 'Authentique, attestée par une organisation',
  'source.C.text':
    'Une organisation a signé cette information et l’a inscrite sur la blockchain. C’est la seule catégorie qu’un demandeur peut vérifier de bout en bout.',

  'cat.identity': 'Identité',
  'cat.address': 'Adresse',
  'cat.education': 'Études',
  'cat.work': 'Emploi et revenus',
  'attr.full_name': 'Nom complet',
  'attr.date_of_birth': 'Date de naissance',
  'attr.age': 'Âge',
  'attr.nationality': 'Nationalité',
  'attr.over_18': 'Majeur',
  'attr.address': 'Adresse postale',
  'attr.postal_code': 'Code postal',
  'attr.city': 'Ville',
  'attr.country': 'Pays',
  'attr.student_status': 'Statut étudiant',
  'attr.school': 'Établissement',
  'attr.study_level': 'Niveau d’études',
  'attr.exam_score': 'Note d’examen',
  'attr.graduation_year': 'Année de diplôme',
  'attr.employment_status': 'En emploi',
  'attr.employer': 'Employeur',
  'attr.job_title': 'Poste',
  'attr.contract_type': 'Type de contrat',
  'attr.annual_salary': 'Salaire annuel (EUR)',

  'vault.lede':
    'Vos informations, chacune marquée de sa provenance. Vous seul pouvez les ouvrir, et vous les partagez via les demandes reçues.',
  'vault.storage.title': 'Stockage temporaire',
  'vault.storage.text':
    'Vos données restent chiffrées, mais sont automatiquement supprimées lors du redémarrage du serveur.',
  'vault.empty.title': 'Votre coffre est vide',
  'vault.empty.text':
    'Importez un document ou une attestation d’organisation pour ajouter vos premières informations.',
  'vault.empty.cta': 'Importer un document',
  'vault.show': 'Afficher',
  'vault.hide': 'Masquer',
  'vault.delete': 'Supprimer',
  'vault.decrypting': 'Déchiffrement…',
  'vault.encrypted': 'Chiffré',
  'vault.itemError':
    'Cet élément n’a pas pu être ouvert ou supprimé. Il a peut-être été modifié sur le serveur.',
  'vault.keyHint':
    'Vos clés de chiffrement restent dans ce navigateur et ne le quittent jamais. La déconnexion les supprime d’ici.',
  'vault.statusTitle': 'Ce que signifie chaque statut',
  'vault.sourcesTitle': 'D’où viennent vos informations',
  'vault.count': '{count} éléments',
  'vault.countOne': '1 élément',
  'attestation.title': 'Ajouter une attestation d’une organisation',
  'attestation.button': 'Choisir un fichier d’attestation',
  'attestation.hint':
    'Le fichier .json qu’une organisation vous a envoyé. Il est chiffré ici avant d’être enregistré.',
  'attestation.busy': 'Chiffrement dans ce navigateur…',
  'attestation.done': 'Ajoutée à votre coffre.',
  'attestation.error': 'L’attestation n’a pas pu être enregistrée. Réessayez.',
  'attestation.locked': 'Vérifiez votre identité avant d’ajouter une attestation.',

  'identity.required.title': 'Vérifiez d’abord votre identité',
  'identity.required.text':
    'L’import de documents et l’ajout d’attestations nécessitent une identité vérifiée. Cela prend une minute avec le PDF de l’application France Identité.',
  'identity.required.cta': 'Vérifier mon identité',
  'identity.verified': 'Identité vérifiée',
  'identity.verifiedText': 'Justificatif France Identité contrôlé et lié à votre portefeuille.',
  'identity.checking': 'Vérification de votre identité…',
  'identity.step1': 'Contrôler le justificatif',
  'identity.step2': 'Le lier à votre portefeuille',
  'identity.file': 'Justificatif France Identité',
  'identity.fileButton': 'Choisir le PDF',
  'identity.fileHint':
    'Le PDF signé de l’application France Identité. Il est contrôlé sur le serveur puis écarté : il n’est jamais conservé.',
  'identity.submit': 'Contrôler mon justificatif',
  'identity.submitBusy': 'Contrôle de la signature…',
  'identity.chooseFirst': 'Choisissez d’abord votre justificatif.',
  'identity.passed': 'Votre justificatif est authentique',
  'identity.passedText': 'Dernière étape : signez avec votre portefeuille pour l’y lier.',
  'identity.bindWarning': 'Avant de signer',
  'identity.sign': 'Signer avec mon portefeuille',
  'identity.signBusy': 'En attente de votre portefeuille…',
  'identity.failed': 'Ce justificatif n’a pas pu être vérifié',
  'identity.retry': 'Choisir un autre justificatif',
  'identity.reason.FORMAT_FAILURE': 'Ce fichier n’est pas un PDF signé.',
  'identity.reason.HASH_FAILURE': 'Le document a été modifié après sa signature.',
  'identity.reason.SIG_CRYPTO_FAILURE': 'La signature est invalide.',
  'identity.reason.NO_SIGNING_CERTIFICATE_FOUND': 'Le certificat du signataire est absent.',
  'identity.reason.NO_CERTIFICATE_CHAIN_FOUND': 'Le signataire n’est pas une autorité reconnue.',
  'identity.reason.OUT_OF_BOUNDS_NO_POE': 'Le certificat du signataire a expiré.',
  'identity.reason.NOT_YET_VALID': 'Le certificat du signataire n’est pas encore valide.',
  'identity.reason.unknown': 'La signature n’a pas pu être contrôlée.',
  'identity.reason.noName': 'Vos nom et prénoms n’ont pas pu être lus sur ce justificatif.',
  'identity.warning':
    'Cette signature lie un document France Identité valablement signé à ce portefeuille. Elle ne prouve pas que la personne qui détient le portefeuille est celle que nomme le document.',

  'import.lede':
    'Vérifiez votre identité, puis ajoutez un document ou l’attestation d’une organisation : Glimpse reconnaît sa nature et applique les contrôles adaptés.',
  'import.identityTitle': 'Votre identité',
  'import.documentTitle': 'Ajouter un document ou une attestation',
  'import.locked': 'Disponible une fois votre identité vérifiée.',
  'import.file': 'Document',
  'import.fileHint':
    'Un document PDF ou texte à votre nom (5 Mo max), ou l’attestation .json envoyée par une organisation.',
  'import.attributes': 'Informations à lire',
  'import.attributesHint':
    'Seules les cases cochées sont lues. Ce que le document ne contient pas est simplement laissé de côté, jamais inventé.',
  'import.selectAll': 'Tout cocher',
  'import.selectNone': 'Tout décocher',
  'import.nameRequired': 'Toujours lu, pour vérifier que le document est à votre nom.',
  'import.consent':
    'Glimpse peut lire ce document sur son serveur pour en extraire les informations ci-dessus. Le texte n’est pas conservé, et chaque valeur est chiffrée dans ce navigateur avant d’être enregistrée.',
  'import.submit': 'Lire le document',
  'import.reading': 'Lecture du document…',
  'import.encrypting': 'Chiffrement dans votre navigateur…',
  'import.chooseFirst': 'Choisissez d’abord un document.',
  'import.tickOne': 'Cochez au moins une information à lire.',
  'import.tooMany': 'Choisissez au plus {max} informations par document.',
  'import.consentRequired': 'Cochez la case pour autoriser Glimpse à lire ce document.',
  'import.failed': 'L’import a échoué, réessayez.',
  'import.signInAgain': 'Se reconnecter',
  'import.verifyIdentity': 'Vérifier mon identité',
  'import.review.title': 'Vérifiez ce qui a été lu',
  'import.review.hint':
    'Corrigez une valeur ou décochez-la avant tout chiffrement. Une valeur modifiée est enregistrée comme votre propre déclaration.',
  'import.review.nameMatched': 'Le nom correspond à votre identité vérifiée',
  'import.review.none': 'Aucune des informations demandées n’a été trouvée dans ce document.',
  'import.review.keep': 'Conserver cette valeur',
  'import.review.value': '{name} : valeur',
  'import.review.missing': 'Absent de ce document : {list}.',
  'import.review.confirm': 'Chiffrer et ajouter à mon coffre',
  'import.review.checkValues': 'Vérifiez les valeurs.',
  'import.done.one': '1 information ajoutée à votre coffre',
  'import.done.many': '{count} informations ajoutées à votre coffre',
  'import.done.signed':
    'La signature du document a été vérifiée : les valeurs conservées telles quelles sont marquées comme issues d’un document signé.',
  'import.done.open': 'Ouvrir mon coffre',
  'import.done.another': 'Importer un autre document',

  'file.choose': 'Choisir un fichier',
  'file.none': 'Aucun fichier choisi',
  'file.aria': '{label} : choisir un fichier',

  'requests.lede':
    'Un vérificateur vous envoie un lien. Ouvrez-le pour voir ce qu’il demande et pourquoi, puis choisissez ce que vous partagez.',
  'requests.open.title': 'Ouvrir une demande',
  'requests.open.text':
    'Un vérificateur vous envoie un lien. Ouvrez-le directement, ou collez-le ici.',
  'requests.open.label': 'Lien de la demande',
  'requests.open.button': 'Ouvrir',
  'requests.open.invalid':
    'Ce n’est pas un lien de demande Glimpse. Demandez au vérificateur de vous le renvoyer.',
  'requests.legend.title': 'Ce qu’un vérificateur peut conclure',
  'requests.legend.text':
    'Le vérificateur contrôle lui-même ce que vous partagez, sur la blockchain, et obtient l’un de ces statuts.',
  'request.title': 'Une demande d’informations',
  'request.lede':
    'Lisez qui demande et pourquoi. Vous choisissez ce que vous partagez, information par information : le reste de votre coffre reste fermé.',
  'request.loading': 'Chargement de la demande…',
  'request.loadFailed': 'Cette demande n’a pas pu être chargée.',
  'request.requester': 'Vérificateur',
  'request.asksFor': 'Demande',
  'request.nothingElse': '{name}, et rien d’autre',
  'request.because': 'Motif',
  'request.before': 'Répondre avant le',
  'request.noMatch':
    'Votre coffre ne contient pas « {name} » dans ce navigateur. Importez un document qui la contient, puis revenez sur ce lien.',
  'request.importCta': 'Importer un document',
  'request.which': 'Ce que vous partagez',
  'request.decrypting': 'Déchiffrement…',
  'request.cannotOpen': 'Impossible à ouvrir',
  'request.shareHint':
    'Le partage chiffre à nouveau cette seule valeur pour le vérificateur, dans votre navigateur. Il la contrôle ensuite lui-même.',
  'request.share': 'Partager',
  'request.sharing': 'Partage…',
  'request.refuse': 'Refuser',
  'request.shared': 'Vous avez partagé « {name} »',
  'request.allowed': 'Votre accord est enregistré, mais rien n’a encore été envoyé',
  'request.withdrawHint':
    'Vous pouvez retirer votre accord tant que le vérificateur ne l’a pas téléchargé. Le retrait n’efface pas une copie déjà reçue.',
  'request.withdraw': 'Retirer mon accord',
  'request.closed.refused': 'Vous avez refusé cette demande.',
  'request.closed.withdrawn':
    'Vous avez retiré votre accord. Le vérificateur ne peut plus télécharger l’élément.',
  'request.closed.expired': 'Cette demande a expiré. Demandez un nouveau lien au vérificateur.',
  'request.closed.answered': 'Cette demande a déjà reçu une réponse.',
  'request.failed': 'Cela n’a pas fonctionné, réessayez.',

  'verify.lede':
    'Demandez une ou plusieurs informations à quelqu’un. Aucun portefeuille requis : vous envoyez un lien, la personne choisit ce qu’elle partage, et votre navigateur contrôle sa réponse sur la blockchain.',
  'verify.what': 'Informations à vérifier',
  'verify.why': 'Motif de la demande',
  'verify.whyPlaceholder': 'Vérifier la note d’examen pour l’admission en master',
  'verify.whyHint': 'Le titulaire le lit avant de décider.',
  'verify.submit': 'Créer la demande',
  'verify.signing': 'Signez dans votre portefeuille…',
  'verify.waiting': 'En attente du titulaire',
  'verify.waitingHint':
    'Envoyez ce lien à la personne dont vous devez vérifier « {name} ». Cette page se met à jour dès sa réponse.',
  'verify.link': 'Lien de la demande',
  'verify.copy': 'Copier le lien',
  'verify.copied': 'Copié',
  'verify.checking': 'Contrôle de ce que le titulaire a partagé…',
  'verify.closed.refused': 'Le titulaire a refusé de partager.',
  'verify.closed.expired': 'Personne n’a répondu à temps. La demande a expiré.',
  'verify.closed.withdrawn':
    'Le titulaire a retiré son accord avant que vous ne receviez l’élément.',
  'verify.closed.other': 'Cette demande est close.',
  'verify.failed': 'La vérification a échoué.',
  'verify.restart': 'Demander autre chose',
  'verify.checkedAt': 'Contrôlé dans ce navigateur sur la blockchain, à {time}.',
  'check.signature': 'Signature de l’émetteur',
  'check.provenance': 'Émetteur et information',
  'check.integrity': 'Contenu intact',
  'check.validity': 'Dans ses dates de validité',
  'check.revocation': 'Non révoquée',
  'check.replay': 'Demande traitée une seule fois',
  'outcome.pass': 'Réussi',
  'outcome.fail': 'Échoué',
  'outcome.unknown': 'Non contrôlé',

  'issue.lede':
    'Pour les organisations. Signez une information pour le portefeuille d’un titulaire et inscrivez-la sur la blockchain : le titulaire reçoit l’attestation, la blockchain seulement un engagement salé.',
  'issue.locked.text':
    'Émettre une attestation nécessite une identité vérifiée pour le portefeuille connecté.',
  'issue.reading': 'Lecture des registres sur la blockchain…',
  'issue.readFailed': 'Les registres n’ont pas pu être lus sur la blockchain.',
  'issue.register.title': 'Enregistrez votre organisation',
  'issue.register.hint':
    'L’enregistrement est ouvert et public. Votre portefeuille devient administrateur et signataire de l’organisation. Les vérificateurs choisissent eux-mêmes à quelles organisations se fier.',
  'issue.register.name': 'Nom de l’organisation',
  'issue.register.placeholder': 'Epitech Paris',
  'issue.register.submit': 'Enregistrer sur la blockchain',
  'issue.confirmWallet': 'Confirmez dans votre portefeuille…',
  'issue.as': 'Émission au nom de',
  'issue.form.title': 'Émettre une attestation',
  'issue.form.holder': 'Adresse du portefeuille du titulaire',
  'issue.form.attribute': 'Information',
  'issue.form.value': 'Valeur',
  'issue.form.validDays': 'Validité (jours)',
  'issue.form.submit': 'Signer et inscrire',
  'issue.form.busy': 'Signez, puis confirmez dans votre portefeuille…',
  'issue.done.title': 'Attestation inscrite',
  'issue.done.hint':
    'Envoyez ce fichier au titulaire. Il contient la valeur et son sel : lui seul doit le recevoir. La blockchain ne garde qu’un engagement salé.',
  'issue.done.download': 'Télécharger l’attestation',
  'issue.done.tx': 'Voir la transaction',
  'issue.done.another': 'En émettre une autre',
  'issue.list.title': 'Émises par votre organisation',
  'issue.list.empty': 'Aucune attestation émise pour l’instant.',
  'issue.list.dates': 'du {from} au {to}',
  'issue.list.revoke': 'Révoquer',
  'issue.list.hint':
    'La blockchain ne garde que des identifiants, des dates et des engagements salés : ni titulaires ni valeurs.',

  'form.required': 'Renseignez ce champ.',
  'form.tooLong': '{max} caractères au maximum.',
  'form.number': 'Saisissez un nombre.',
  'form.date': 'Saisissez une date valide.',
  'form.address': 'Saisissez une adresse de portefeuille : 0x suivi de 40 caractères.',
  'form.range': 'Saisissez un nombre entier de {min} à {max}.',
  'import.kind.document': 'Document',
  'import.kind.documentText':
    'Glimpse lit les informations cochées ci-dessous et vérifie que le document est à votre nom. Un PDF signé est reconnu automatiquement.',
  'import.kind.attestation': 'Attestation d’une organisation',
  'import.kind.attestationText':
    'Glimpse vérifie qu’elle a été émise pour votre portefeuille, qu’elle est inscrite sur la blockchain et non révoquée, puis la chiffre dans ce navigateur.',
  'import.submitAttestation': 'Vérifier et ajouter à mon coffre',
  'import.checkingAttestation': 'Vérification de l’attestation…',
  'import.done.attestation':
    'Le vérificateur qui la contrôlera verra si elle est toujours valide sur la blockchain.',
  'attestation.missing':
    'Cette attestation n’est pas inscrite sur la blockchain. Demandez à l’organisation de l’inscrire.',
  'attestation.revoked': 'L’organisation a révoqué cette attestation : elle ne prouve plus rien.',
  'issue.gasHint':
    'L’inscription sur la blockchain est une transaction Base Sepolia : votre portefeuille vous demande de la confirmer et de payer de faibles frais de réseau de test.',
  'issue.list.revokeTitle': 'Révoquer cette attestation ?',
  'issue.list.revokeText':
    'Tout vérificateur la verra comme révoquée. Cette action est irréversible.',
  'vault.add': 'Ajouter',
  'vault.loading': 'Ouverture de votre coffre…',
  'vault.deleteTitle': 'Supprimer cet élément ?',
  'vault.deleteText': '« {name} » sera supprimé de votre coffre. Cette action est irréversible.',
  'vault.shareHint':
    'Pour partager un élément, ouvrez le lien qu’un vérificateur vous a envoyé dans',
  'vault.shareLink': 'Demandes',
  'request.declared': 'Nom indiqué par le demandeur, non vérifié.',
  'request.whichHint':
    'Choisissez, pour chaque information, la valeur à partager ou « Ne pas partager ». Rien d’autre ne quitte votre coffre.',
  'request.dontShare': 'Ne pas partager',
  'request.notInVault': 'Absent de votre coffre.',
  'request.emptyVault':
    'Votre coffre ne contient aucune des informations demandées. Importez un document qui les contient, puis revenez sur ce lien.',
  'request.pickOne': 'Choisissez au moins une valeur à partager, ou refusez la demande.',
  'request.shareSelection': 'Partager ma sélection',
  'request.refuseAll': 'Refuser la demande',
  'request.refuseTitle': 'Refuser cette demande ?',
  'request.refuseText': 'Le demandeur verra votre refus. Rien n’est partagé.',
  'request.withdrawTitle': 'Retirer votre accord ?',
  'request.withdrawText':
    'Le demandeur ne pourra plus télécharger ce que vous avez partagé. Une copie déjà reçue ne peut pas être effacée.',
  'request.signIn.title': 'Connectez-vous pour répondre',
  'request.signIn.text':
    'Consulter cette demande ne nécessite aucun compte. Pour partager une information, connectez-vous avec votre portefeuille : votre coffre s’ouvre dans ce navigateur.',
  'request.signIn.cta': 'Se connecter pour répondre',
  'status.title': 'Votre demande',
  'status.lede':
    'Envoyez le lien à la personne concernée. Ses réponses s’affichent ici et sont vérifiées dans votre navigateur.',
  'status.share.title': 'Lien à envoyer',
  'status.share.text':
    'Toute personne disposant de ce lien peut lire votre demande, jamais une valeur. Vous seul, dans ce navigateur, pouvez lire les réponses.',
  'status.answers': 'Réponses',
  'status.checks': 'Détail des contrôles',
  'status.expiredOn': 'Expirée le',
  'status.withdrawnAfter': 'Le titulaire a depuis retiré son accord.',
  'status.otherBrowser.title': 'Cette demande n’est pas dans ce navigateur',
  'status.otherBrowser.text':
    'Seul le navigateur qui a créé une demande peut en lire les réponses. Ouvrez-la depuis celui-ci, ou créez-en une nouvelle.',
  'status.newRequest': 'Nouvelle demande',
  'state.pending': 'En attente de réponse',
  'state.refused': 'Refusée',
  'state.allowed': 'Envoi en cours',
  'state.shared': 'Partagée',
  'state.withdrawn': 'Accord retiré',
  'state.expired': 'Expirée',
  'state.answered': 'Déjà répondu',
  'verify.name': 'Qui demande',
  'verify.namePlaceholder': 'Admissions Epitech',
  'verify.nameHint': 'Votre nom ou celui de votre organisation, affiché à la personne sollicitée.',
  'verify.whatHint': 'Cochez jusqu’à {max} informations. La personne choisit lesquelles partager.',
  'verify.pickOne': 'Cochez au moins une information.',
  'verify.tooMany': 'Cochez {max} informations au maximum.',
  'verify.lifetime': 'Validité',
  'verify.lifetime.1': '1 heure',
  'verify.lifetime.24': '24 heures',
  'verify.lifetime.168': '7 jours',
  'verify.creating': 'Création de la demande…',
  'verify.createFailed': 'La demande n’a pas pu être créée. Réessayez.',
  'verify.noWallet':
    'Aucun portefeuille ni compte nécessaire. La demande et les clés qui lisent les réponses restent dans ce navigateur.',
  'verify.mine': 'Vos demandes dans ce navigateur',
  'verify.until': 'Ouverte jusqu’au {date}',
  'verify.expiredOn': 'Expirée le {date}',
  'verify.open': 'Ouvrir',
  'verify.forget': 'Oublier',
  'verify.forgetTitle': 'Oublier cette demande ?',
  'verify.forgetText':
    'Ses clés sont supprimées de ce navigateur : ses réponses ne pourront plus y être lues.',
  'verify.shareSheet': 'Partager',
  'wallet.none': 'Aucun portefeuille trouvé. Installez MetaMask ou un autre portefeuille Ethereum.',
  'wallet.cancelled': 'Vous avez annulé la demande dans votre portefeuille.',
  'wallet.otherAccount': 'Votre portefeuille est sur un autre compte que celui de votre connexion.',
  'wallet.signInFailed': 'La connexion a échoué, réessayez.',
  'wallet.txFailed': 'La transaction a échoué sur la blockchain.',
  'wallet.signerOnly': 'Signez avec le portefeuille signataire de l’organisation.',
}

export const messages = { en, fr } as const

/**
 * The French for every message a server route or a library can send back in English. The browser
 * shows these through `useI18n().error`, so an error reads in the chosen language too.
 */
export const errorTranslations: Record<string, string> = {
  // Wallet and sign-in
  [walletMessages.unauthorized]:
    'Votre portefeuille n’a pas autorisé ce site pour ce compte. Ouvrez votre portefeuille, connectez ce compte au site, puis réessayez.',
  [walletMessages.locked]: 'Déverrouillez votre portefeuille, puis réessayez.',
  [walletMessages.pending]:
    'Une demande attend déjà dans votre portefeuille. Ouvrez-le pour y répondre.',
  [walletMessages.wrongChain]:
    'Passez votre portefeuille sur le réseau Base Sepolia, puis réessayez.',
  [walletMessages.funds]:
    'Ce compte n’a pas d’ETH Base Sepolia pour payer les frais de réseau. Obtenez-en auprès d’un faucet.',
  [walletMessages.network]: 'Le réseau ne répond pas. Vérifiez votre connexion et réessayez.',
  [walletMessages.issuerExists]: 'Cet identifiant d’organisation est déjà pris. Réessayez.',
  [walletMessages.notSigner]: 'Ce portefeuille n’est pas le signataire de l’organisation.',
  [walletMessages.notIssuer]: 'Seule l’organisation qui a émis cette attestation peut la révoquer.',
  [walletMessages.alreadyAnchored]: 'Cette attestation est déjà inscrite.',
  [walletMessages.alreadyRevoked]: 'Cette attestation est déjà révoquée.',
  [walletMessages.invalidValidity]: 'Le registre n’accepte pas ces dates de validité.',
  [walletMessages.badSignature]:
    'La signature de l’organisation ne correspond pas à cette attestation.',
  [walletMessages.unknownIssuer]: 'Cette organisation n’est pas enregistrée sur la blockchain.',
  [walletMessages.generic]: 'L’opération du portefeuille a échoué. Réessayez.',
  [en['wallet.none']]: fr['wallet.none'],
  [en['wallet.cancelled']]: fr['wallet.cancelled'],
  [en['wallet.otherAccount']]: fr['wallet.otherAccount'],
  [en['wallet.signInFailed']]: fr['wallet.signInFailed'],
  [en['wallet.txFailed']]: fr['wallet.txFailed'],
  [en['wallet.signerOnly']]: fr['wallet.signerOnly'],
  'Malformed sign-in request': 'Demande de connexion mal formée.',
  'Sign-in expired, try again': 'La connexion a expiré, réessayez.',
  'Invalid signature': 'Signature invalide.',
  'The public key is not a valid encryption key.':
    'La clé publique n’est pas une clé de chiffrement valide.',
  'Key id already bound to another key': 'Cet identifiant de clé est déjà lié à une autre clé.',
  'Too many keys': 'Trop de clés enregistrées. Reconnectez-vous.',
  'Invalid key id': 'Identifiant de clé invalide.',
  'The registries could not be read from the chain.':
    'Les registres n’ont pas pu être lus sur la blockchain.',
  'Unknown holder': 'Titulaire inconnu. Reconnectez-vous.',
  'The request was malformed.': 'La requête est mal formée.',
  'The request is malformed.': 'La requête est mal formée.',
  // Vault
  'Your session has ended. Sign in again.': 'Votre session a expiré. Reconnectez-vous.',
  'This browser has no vault key registered yet.':
    'Ce navigateur n’a pas encore de clé de coffre enregistrée.',
  'Sign in again to reach your vault.': 'Reconnectez-vous pour accéder à votre coffre.',
  'This item is not yours, or your consent has expired.':
    'Cet élément ne vous appartient pas, ou votre accord a expiré.',
  'The upload is too large.': 'Le fichier est trop volumineux.',
  'The stored item is damaged.': 'L’élément enregistré est endommagé.',
  'Vault storage is unavailable, try again.': 'Le stockage du coffre est indisponible, réessayez.',
  'Something went wrong on the server.': 'Une erreur est survenue sur le serveur.',
  'The vault did not answer, try again.': 'Le coffre ne répond pas, réessayez.',
  'This item was encrypted for another key.': 'Cet élément a été chiffré pour une autre clé.',
  'Some of the information you ticked is not in this document. Untick it and try again.':
    'Certaines informations cochées ne figurent pas dans ce document. Décochez-les et réessayez.',
  // Identity and import
  'Verify your identity with France Identité first.':
    'Vérifiez d’abord votre identité avec France Identité.',
  'The name on this proof could not be read. Use the PDF from the France Identité app.':
    'Le nom n’a pas pu être lu sur ce justificatif. Utilisez le PDF de l’application France Identité.',
  'Choose the PDF to check.': 'Choisissez le PDF à contrôler.',
  'This report does not exist.': 'Ce rapport n’existe pas.',
  'Only a document whose signature passed can be bound.':
    'Seul un document dont la signature est valide peut être lié.',
  'This report is already bound to a wallet.': 'Ce rapport est déjà lié à un portefeuille.',
  'The signature does not match your wallet.':
    'La signature ne correspond pas à votre portefeuille.',
  'Choose a document and the attributes to extract.':
    'Choisissez un document et les informations à extraire.',
  'Choose at least one attribute to extract.': 'Choisissez au moins une information à extraire.',
  'The full name is always read, to match it with your identity.':
    'Le nom complet est toujours lu, pour le comparer à votre identité.',
  'No full name could be read from this document, so it cannot be matched with your identity.':
    'Aucun nom complet n’a pu être lu dans ce document : il ne peut pas être rapproché de votre identité.',
  'The name on this document does not match your verified identity.':
    'Le nom figurant sur ce document ne correspond pas à votre identité vérifiée.',
  'Import a PDF or a UTF-8 text file.': 'Importez un PDF ou un fichier texte UTF-8.',
  'The document has too many pages.': 'Le document comporte trop de pages.',
  // Requests
  'Nothing to share for this request.': 'Rien à partager pour cette demande.',
  'Choose the item to share, or refuse the request.':
    'Choisissez l’élément à partager, ou refusez la demande.',
  'The requester’s key is no longer registered.': 'La clé du vérificateur n’est plus enregistrée.',
  'This item is not in your vault.': 'Cet élément n’est pas dans votre coffre.',
  'This is not your request.': 'Cette demande n’est pas la vôtre.',
  'The holder has not shared anything for this request.':
    'Le titulaire n’a rien partagé pour cette demande.',
  'Only the holder who answered can withdraw.':
    'Seul le titulaire qui a répondu peut retirer son accord.',
  'Sign the request with the wallet you are signed in with.':
    'Signez la demande avec le portefeuille de votre connexion.',
  'The request is signed for another chain.': 'La demande est signée pour une autre blockchain.',
  'This attribute cannot be requested.': 'Cette information ne peut pas être demandée.',
  'Say why you need it, in 200 characters or less.':
    'Indiquez pourquoi vous en avez besoin, en 200 caractères maximum.',
  'The request must be valid for seven days at most, starting now.':
    'La demande doit être valable sept jours au plus, à partir de maintenant.',
  'Say who is asking, in 80 characters or less.': 'Indiquez qui demande, en 80 caractères maximum.',
  'Too many open requests right now. Try again later.':
    'Trop de demandes en cours. Réessayez plus tard.',
  'The request must name an encryption key you registered.':
    'La demande doit désigner une clé de chiffrement que vous avez enregistrée.',
  'The request signature does not match the requester.':
    'La signature de la demande ne correspond pas au vérificateur.',
  'This request already exists.': 'Cette demande existe déjà.',
  'This request does not exist.': 'Cette demande n’existe pas.',
  'This request has expired.': 'Cette demande a expiré.',
  'This request was already answered.': 'Cette demande a déjà reçu une réponse.',
  'This request was made before the page was reloaded. Create a new one.':
    'Cette demande a été créée avant le rechargement de la page. Créez-en une nouvelle.',
  // Issuer
  'Give the organisation a name of 80 characters or less.':
    'Donnez à l’organisation un nom de 80 caractères maximum.',
  'Choose yes or no.': 'Choisissez oui ou non.',
  'Enter a number.': 'Saisissez un nombre.',
  'Enter a date as YYYY-MM-DD.': 'Saisissez une date au format AAAA-MM-JJ.',
  'Enter a value.': 'Saisissez une valeur.',
  'Enter the holder’s wallet address.': 'Saisissez l’adresse du portefeuille du titulaire.',
  "Enter the holder's wallet address.": 'Saisissez l’adresse du portefeuille du titulaire.',
  'Validity is 1 to 1830 days.': 'La validité va de 1 à 1830 jours.',
  'This file is not an attestation.': 'Ce fichier n’est pas une attestation.',
  'This attestation was issued to another wallet.':
    'Cette attestation a été émise pour un autre portefeuille.',
  'This attestation was issued on another network.':
    'Cette attestation a été émise sur un autre réseau.',
}
