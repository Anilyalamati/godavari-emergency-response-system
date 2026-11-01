export type Language = 'en' | 'te';

export interface Translations {
  // Common / Header / Safety
  safetyAlertTitle: string;
  safetyAlertText: string;
  safetyCallBtn: string;
  brandName: string;
  brandCaption: string;
  stageTag: string;
  teluguReviewDisclaimer: string;

  // Nav
  navOverview: string;
  navReport: string;
  navTrack: string;
  navStaffLogin: string;
  navSignOut: string;

  // Queue Status
  queueDraftLocal: string;
  queueSending: string;
  queueReceived: string;
  queueFailed: string;
  queueOnline: string;
  queueOffline: string;
  queueClearDraft: string;

  // Reporting Form
  reportHeading: string;
  reportEyebrow: string;
  reportSummaryHint: string;
  categoryLegend: string;
  shortDescLabel: string;
  shortDescHint: string;
  shortDescPlaceholder: string;
  locationLegend: string;
  locationHint: string;
  zoneLabel: string;
  zoneHint: string;
  zonePlaceholder: string;
  landmarkLabel: string;
  landmarkHint: string;
  landmarkPlaceholder: string;
  gpsButton: string;
  gpsAcquiring: string;
  gpsClear: string;
  confirmLocationLabel: string;
  confirmLocationHint: string;
  callbackLabel: string;
  callbackHint: string;
  submitReportBtn: string;
  transmittingBtn: string;
  emergencyCallBannerTitle: string;
  emergencyCallBannerText: string;

  // Confirmation view
  successTitle: string;
  successSummary: string;
  incidentIdLabel: string;
  trackingTokenTitle: string;
  trackingTokenHelp: string;
  copyTokenBtn: string;
  tokenCopied: string;
  trackIncidentBtn: string;
  submitAnotherBtn: string;

  // Tracking page
  trackHeading: string;
  trackEyebrow: string;
  trackSummary: string;
  trackTokenLabel: string;
  trackTokenPlaceholder: string;
  checkStatusBtn: string;
  checkingStatusBtn: string;
  trackPrivacyNotice: string;
  trackEscalationReminder: string;

  // Categories (Display Only - DB enums untouched)
  catMedical: string;
  catMedicalDesc: string;
  catCrowd: string;
  catCrowdDesc: string;
  catLost: string;
  catLostDesc: string;
  catInfra: string;
  catInfraDesc: string;
  catOther: string;
  catOtherDesc: string;

  // Status Labels (Display Only)
  statusReported: string;
  statusUnderReview: string;
  statusAssigned: string;
  statusEnRoute: string;
  statusOnScene: string;
  statusResolved: string;
  statusClosed: string;
  statusCancelled: string;

  // Responder workspace
  responderTitle: string;
  responderSub: string;
  ackBtn: string;
  enRouteBtn: string;
  onSceneBtn: string;
  resolveBtn: string;
  reqSupportBtn: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    safetyAlertTitle: 'Test environment — not connected to emergency services.',
    safetyAlertText: 'For urgent assistance, call 112 directly.',
    safetyCallBtn: 'Call 112',
    brandName: 'Godavari Safety',
    brandCaption: '',
    stageTag: '',
    teluguReviewDisclaimer: '',

    navOverview: 'Overview',
    navReport: 'Report',
    navTrack: 'Track',
    navStaffLogin: 'Staff sign-in',
    navSignOut: 'Sign out',

    queueDraftLocal: 'Draft saved locally — not sent',
    queueSending: 'Sending…',
    queueReceived: 'Received by server',
    queueFailed: 'Failed — not sent',
    queueOnline: 'Online',
    queueOffline: 'Offline',
    queueClearDraft: 'Clear Local Draft',

    reportHeading: 'Report an emergency',
    reportEyebrow: 'Emergency Report',
    reportSummaryHint: '',
    categoryLegend: 'Category',
    shortDescLabel: 'Short Description of Emergency',
    shortDescHint: 'Describe the situation and immediate dangers (minimum 3 characters).',
    shortDescPlaceholder:
      'e.g. Elderly person collapsed near ghat steps, breathing but unresponsive.',
    locationLegend: 'Location & Landmarks',
    locationHint: 'Specify the nearest zone, landmark, or GPS coordinates.',
    zoneLabel: 'Festival Zone',
    zoneHint: 'Nearest sector or bathing ghat.',
    zonePlaceholder: '-- Select zone (optional) --',
    landmarkLabel: 'Landmark or Specific Location',
    landmarkHint: 'Describe identifiable landmarks or nearby stalls.',
    landmarkPlaceholder: 'e.g. Near Step 4 North Pavilion, opposite water stall #2',
    gpsButton: 'Share GPS location',
    gpsAcquiring: 'Acquiring GPS location…',
    gpsClear: 'Clear GPS',
    confirmLocationLabel: 'I confirm this incident location',
    confirmLocationHint: 'The incident is occurring at or near the specified location.',
    callbackLabel: 'Callback Phone Number (Optional)',
    callbackHint: 'International format starting with + (e.g. +919876543210).',
    submitReportBtn: 'Submit Emergency Report',
    transmittingBtn: 'Sending report…',
    emergencyCallBannerTitle: 'Life-threatening emergency? Call 112 immediately',
    emergencyCallBannerText: 'Do not wait for online updates if immediate help is required.',

    successTitle: 'Emergency report logged',
    successSummary: 'Your report has been received by the control room.',
    incidentIdLabel: 'Incident ID',
    trackingTokenTitle: 'TRACKING TOKEN',
    trackingTokenHelp: 'Save this tracking token to check status updates.',
    copyTokenBtn: 'Copy token',
    tokenCopied: 'Copied ✓',
    trackIncidentBtn: 'Track status →',
    submitAnotherBtn: 'Submit another report',

    trackHeading: 'Track an emergency report',
    trackEyebrow: 'Incident Tracking',
    trackSummary: '',
    trackTokenLabel: 'Tracking Token',
    trackTokenPlaceholder: 'Paste your 32-character tracking token…',
    checkStatusBtn: 'Check status',
    checkingStatusBtn: 'Checking…',
    trackPrivacyNotice:
      'Operational updates show high-level status only. Field coordinates and personal details are protected.',
    trackEscalationReminder:
      'If the situation worsens or immediate medical help is needed, call 112.',

    catMedical: 'Medical assistance',
    catMedicalDesc: 'Heat exhaustion, collapse, trauma, cardiac, or drowning.',
    catCrowd: 'Crowd safety',
    catCrowdDesc: 'Crush risk, barricade surge, dangerous density, or blocked egress.',
    catLost: 'Missing person',
    catLostDesc: 'Separated child, elder, or group member needing reunification.',
    catInfra: 'Infrastructure hazard',
    catInfraDesc: 'Electrical wire, barricade failure, pontoon instability, or fire.',
    catOther: 'Other emergency',
    catOtherDesc: 'Urgent situation not fitting the categories above.',

    statusReported: 'Report Received by Control Room',
    statusUnderReview: 'Under Operator Review',
    statusAssigned: 'Team Assigned',
    statusEnRoute: 'Team En Route',
    statusOnScene: 'Team Responding On-Scene',
    statusResolved: 'Incident Resolved',
    statusClosed: 'Incident Closed',
    statusCancelled: 'Report Cancelled',

    responderTitle: 'Assigned Incidents',
    responderSub: 'Active field response assignments.',
    ackBtn: 'Acknowledge assignment',
    enRouteBtn: 'Mark En Route →',
    onSceneBtn: 'Mark On-Scene →',
    resolveBtn: 'Mark Resolved ✓',
    reqSupportBtn: 'Request support',
  },
  te: {
    safetyAlertTitle: 'పరీక్షా ప్లాట్‌ఫారమ్ — అత్యవసర అధికారిక సేవ కాదు.',
    safetyAlertText: 'అత్యవసర సహాయం కొరకు తక్షణమే 112 కు కాల్ చేయండి.',
    safetyCallBtn: '112 కు కాల్ చేయండి',
    brandName: 'గోదావరి భద్రత',
    brandCaption: '',
    stageTag: '',
    teluguReviewDisclaimer:
      'గమనిక: ఈ తెలుగు అనువాదం ముసాయిదా మాత్రమే, అధికారిక సమీక్ష అవసరం. అత్యవసర పరిస్థితుల్లో తక్షణమే 112 కు కాల్ చేయండి.',

    navOverview: 'వివరాలు',
    navReport: 'నివేదించండి',
    navTrack: 'ట్రాక్ చేయండి',
    navStaffLogin: 'సిబ్బంది లాగిన్',
    navSignOut: 'లాగ్ అవుట్',

    queueDraftLocal: 'డ్రాఫ్ట్ స్థానికంగా భద్రపరచబడింది — పంపబడలేదు',
    queueSending: 'పంపబడుతోంది…',
    queueReceived: 'సర్వర్‌కు చేరింది',
    queueFailed: 'విఫలమైంది — పంపబడలేదు',
    queueOnline: 'ఆన్‌లైన్',
    queueOffline: 'ఆఫ్‌లైన్',
    queueClearDraft: 'డ్రాఫ్ట్ తొలగించు',

    reportHeading: 'అత్యవసర పరిస్థితిని నివేదించండి',
    reportEyebrow: 'అత్యవసర నివేదిక',
    reportSummaryHint: '',
    categoryLegend: 'విభాగం',
    shortDescLabel: 'సంఘటన సంక్షిప్త వివరణ',
    shortDescHint: 'ఏమి జరుగుతోందో తెలపండి (కనీసం 3 అక్షరాలు).',
    shortDescPlaceholder: 'ఉదాహరణ: ఘాట్ మెట్ల వద్ద వృద్ధుడు స్పృహ కోల్పోయారు.',
    locationLegend: 'స్థలం మరియు ల్యాండ్‌మార్కులు',
    locationHint: 'సమీప పుష్కర జోన్, ల్యాండ్‌మార్క్ లేదా GPS లొకేషన్‌ను పేర్కొనండి.',
    zoneLabel: 'పుష్కర జోన్',
    zoneHint: 'సమీపంలోని స్నానఘట్టం లేదా సెక్టార్.',
    zonePlaceholder: '-- జోన్ ఎంచుకోండి (ఐచ్ఛికం) --',
    landmarkLabel: 'ల్యాండ్‌మార్క్ లేదా ఖచ్చితమైన స్థలం',
    landmarkHint: 'గుర్తుపట్టే స్తంభం నంబర్ లేదా సమీప దుకాణం వివరాలు.',
    landmarkPlaceholder: 'ఉదా: 4వ మెట్టు వద్ద, మంచినీటి స్టాల్ ఎదురుగా',
    gpsButton: 'GPS లొకేషన్ పంపండి',
    gpsAcquiring: 'GPS లొకేషన్ సేకరిస్తోంది…',
    gpsClear: 'GPS తొలగించు',
    confirmLocationLabel: 'ఈ సంఘటన స్థలాన్ని నేను ధృవీకరిస్తున్నాను',
    confirmLocationHint: 'పేర్కొన్న ప్రాంతంలోనే సంఘటన జరుగుతోందని నిర్ధారిస్తున్నాను.',
    callbackLabel: 'సంప్రదించాల్సిన ఫోన్ నంబర్ (ఐచ్ఛికం)',
    callbackHint: 'అంతర్జాతీయ ఫార్మాట్ + తో (ఉదా: +919876543210).',
    submitReportBtn: 'అత్యవసర నివేదికను పంపండి',
    transmittingBtn: 'పంపబడుతోంది…',
    emergencyCallBannerTitle: 'ప్రాణాపాయ పరిస్థితుల్లో: వెంటనే 112 కు కాల్ చేయండి',
    emergencyCallBannerText: 'తక్షణ సహాయం అవసరమైతే ఆన్‌లైన్ స్పందనల కోసం వేచి ఉండకండి.',

    successTitle: 'అత్యవసర నివేదిక నమోదైంది',
    successSummary: 'మీ నివేదిక కంట్రోల్ రూమ్‌కు చేరింది.',
    incidentIdLabel: 'నివేదిక ID',
    trackingTokenTitle: 'ట్రాకింగ్ టోకెన్',
    trackingTokenHelp: 'నివేదిక స్థితిని తెలుసుకోవడానికి ఈ టోకెన్‌ను భద్రపరుచుకోండి.',
    copyTokenBtn: 'టోకెన్ కాపీ చేయండి',
    tokenCopied: 'కాపీ అయింది ✓',
    trackIncidentBtn: 'స్థితిని ట్రాక్ చేయండి →',
    submitAnotherBtn: 'మరొక నివేదిక పంపండి',

    trackHeading: 'అత్యవసర నివేదిక స్థితిని ట్రాక్ చేయండి',
    trackEyebrow: 'నివేదిక ట్రాకింగ్',
    trackSummary: '',
    trackTokenLabel: 'ట్రాకింగ్ టోకెన్',
    trackTokenPlaceholder: 'మీ 32 అక్షరాల ట్రాకింగ్ టోకెన్‌ను నమోదు చేయండి…',
    checkStatusBtn: 'స్థితిని తనిఖీ చేయండి',
    checkingStatusBtn: 'తనిఖీ జరుగుతోంది…',
    trackPrivacyNotice:
      'నివేదిక స్థితి మాత్రమే చూపబడుతుంది. వ్యక్తిగత మరియు క్షేత్రస్థాయి వివరాలు రక్షించబడతాయి.',
    trackEscalationReminder: 'పరిస్థితి విషమిస్తోంటే వెంటనే 112 కు కాల్ చేయండి.',

    catMedical: 'వైద్య సహాయం',
    catMedicalDesc: 'వడదెబ్బ, గాయం, స్పృహ కోల్పోవడం, గుండె సమస్య లేదా మునిగిపోవడం.',
    catCrowd: 'జనసమూహ భద్రత',
    catCrowdDesc: 'తోపులాట ప్రమాదం, బారికేడ్ల ఒత్తిడి లేదా రద్దీ మార్గాలు స్తంభించడం.',
    catLost: 'తప్పిపోయిన వ్యక్తి',
    catLostDesc: 'తప్పిపోయిన పిల్లలు, వృద్ధులు లేదా కుటుంబ సభ్యులు.',
    catInfra: 'మౌలిక సదుపాయాల ప్రమాదం',
    catInfraDesc: 'విద్యుత్ తీగలు, బారికేడ్ వైఫల్యం, అగ్నిప్రమాదం లేదా గ్యాస్ లీక్.',
    catOther: 'ఇతర అత్యవసరాలు',
    catOtherDesc: 'పై విభాగాల్లోకి రాని ఇతర తక్షణ సమస్యలు.',

    statusReported: 'నివేదిక కంట్రోల్ రూమ్‌కు చేరింది',
    statusUnderReview: 'ఆపరేటర్ సమీక్షిస్తున్నారు',
    statusAssigned: 'బృందం కేటాయించబడింది',
    statusEnRoute: 'బృందం బయలుదేరింది',
    statusOnScene: 'బృందం సంఘటన స్థలంలో ఉంది',
    statusResolved: 'పరిష్కరించబడింది',
    statusClosed: 'ముగిసింది',
    statusCancelled: 'నివేదిక రద్దు చేయబడింది',

    responderTitle: 'కేటాయించిన బాధ్యతలు',
    responderSub: 'క్రియాశీల ఫీల్డ్ రెస్పాండర్ల బాధ్యతలు.',
    ackBtn: 'బాధ్యతను స్వీకరించండి',
    enRouteBtn: 'బయలుదేరినట్లు నమోదు చేయండి →',
    onSceneBtn: 'చేరుకున్నట్లు నమోదు చేయండి →',
    resolveBtn: 'పరిష్కరించినట్లు నమోదు చేయండి ✓',
    reqSupportBtn: 'సహాయాన్ని కోరండి',
  },
};
