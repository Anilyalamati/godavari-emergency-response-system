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
    safetyAlertTitle: 'Hackathon prototype — not an emergency service.',
    safetyAlertText:
      'This site cannot request or guarantee help. For urgent assistance, use a phone to call 112 if telephone coverage is available.',
    safetyCallBtn: 'Call 112',
    brandName: 'GODAVARI',
    brandCaption: 'COORDINATION PROTOTYPE',
    stageTag: 'Staff access / prototype',
    teluguReviewDisclaimer: '',

    navOverview: 'Overview',
    navReport: 'Report',
    navTrack: 'Track',
    navStaffLogin: 'Staff sign-in',
    navSignOut: 'Sign out',

    queueDraftLocal: 'Draft saved locally — not sent',
    queueSending: 'Sending',
    queueReceived: 'Received by server',
    queueFailed: 'Failed — not sent',
    queueOnline: '🟢 Online',
    queueOffline: '🔴 Offline',
    queueClearDraft: '🗑️ Clear Local Draft',

    reportHeading: 'Report an emergency',
    reportEyebrow: 'Public intake / Stage 11',
    reportSummaryHint:
      'Submit an emergency report directly to the Godavari coordination control room. Reports are stored in a local IndexedDB queue and automatically reconcile if your connection drops.',
    categoryLegend: 'Emergency Category *',
    shortDescLabel: 'Short Description of Emergency *',
    shortDescHint:
      'Describe what is happening, visible injuries, number of people affected, or immediate dangers (minimum 3 characters).',
    shortDescPlaceholder:
      'e.g. Elderly person collapsed near ghat steps, breathing but unresponsive. Crowd gathered.',
    locationLegend: 'Location & Landmarks *',
    locationHint:
      'Provide as much location context as possible. You can select a known festival zone, describe a landmark, or share your GPS coordinates.',
    zoneLabel: 'Festival Zone',
    zoneHint: 'Select the nearest recognized sector, bathing ghat, or pavilion.',
    zonePlaceholder: '-- Select nearest known zone (optional) --',
    landmarkLabel: 'Landmark or Specific Location *',
    landmarkHint:
      'e.g. Near Step 4 North Pavilion, opposite drinking water stall #2, by the giant banyan tree.',
    landmarkPlaceholder: 'Describe identifiable landmarks, pillar numbers, or nearby stalls…',
    gpsButton: 'Share device GPS location',
    gpsAcquiring: 'Acquiring GPS location…',
    gpsClear: 'Clear GPS',
    confirmLocationLabel: 'I confirm this incident location',
    confirmLocationHint:
      'I verify that the incident is occurring at or near the specified zone/landmark.',
    callbackLabel: 'Callback Phone Number (Optional)',
    callbackHint:
      'International format starting with + (e.g. +919876543210). Only stored if provided and accessible solely to authorized operations staff.',
    submitReportBtn: 'Submit Emergency Report',
    transmittingBtn: 'Transmitting report…',
    emergencyCallBannerTitle: 'For life-threatening emergencies: Call 112 immediately',
    emergencyCallBannerText:
      'Do not wait for form responses if immediate evacuation or police help is required.',

    successTitle: 'Emergency report logged',
    successSummary:
      'Your emergency report has been received and stored in the coordination database. Control room operators can now see this incident.',
    incidentIdLabel: 'Incident ID',
    trackingTokenTitle: 'YOUR TRACKING TOKEN',
    trackingTokenHelp:
      'Save this private tracking token. You can use it to track real-time incident status progression without exposing your identity.',
    copyTokenBtn: 'Copy token',
    tokenCopied: 'Copied ✓',
    trackIncidentBtn: 'Track incident status →',
    submitAnotherBtn: 'Submit another report',

    trackHeading: 'Track an emergency report',
    trackEyebrow: 'Public Tracking / Stage 11',
    trackSummary:
      'Check operational progress for a previously logged emergency report using your private tracking code.',
    trackTokenLabel: 'Tracking Token (32-character hexadecimal code)',
    trackTokenPlaceholder: 'Paste your 32-character tracking token…',
    checkStatusBtn: 'Check status',
    checkingStatusBtn: 'Checking status…',
    trackPrivacyNotice:
      'Operational integrity boundary: Response team radio channels, responder identities, and live telemetry are protected to safeguard tactical field safety. Callback numbers and internal triage logs are strictly restricted to authorized control-room operators.',
    trackEscalationReminder:
      'Emergency condition deteriorating? If the situation worsens or immediate medical/rescue intervention is required, do not wait for tracking updates: Call 112 immediately.',

    catMedical: 'Medical assistance',
    catMedicalDesc: 'Heat exhaustion, collapse, stampede injury, cardiac, trauma, or drowning.',
    catCrowd: 'Crowd safety',
    catCrowdDesc: 'Crush risk, barricade surge, dangerous density, or blocked egress route.',
    catLost: 'Missing person',
    catLostDesc:
      'Separated child, disoriented elder, or missing group member needing reunification.',
    catInfra: 'Infrastructure hazard',
    catInfraDesc: 'Electrical wire, barricade failure, pontoon instability, fire, or gas leak.',
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
    responderSub: 'Mobile dispatch view for authorized field responders.',
    ackBtn: 'Acknowledge dispatch',
    enRouteBtn: 'Mark En Route →',
    onSceneBtn: 'Mark On-Scene →',
    resolveBtn: 'Resolve incident ✓',
    reqSupportBtn: 'Request additional support',
  },
  te: {
    // Note: Marked as prototype wording requiring fluent-speaker review.
    safetyAlertTitle: 'హ్యాకథాన్ నమూనా — అత్యవసర అధికారిక సేవ కాదు.',
    safetyAlertText:
      'ఈ సైట్ సహాయాన్ని హామీ ఇవ్వలేదు. అత్యవసర సహాయం కొరకు తక్షణమే ఫోన్ ద్వారా 112 కు కాల్ చేయండి.',
    safetyCallBtn: '112 కు కాల్ చేయండి',
    brandName: 'గోదావరి',
    brandCaption: 'కోఆర్డినేషన్ ప్రోటోటైప్',
    stageTag: 'సిబ్బంది యాక్సెస్ / నమూనా',
    teluguReviewDisclaimer:
      'గమనిక: ఈ తెలుగు అనువాదం నమూనా ముసాయిదా మాత్రమే, అధికారిక సమీక్ష అవసరం. అత్యవసర పరిస్థితుల్లో తక్షణమే 112 కు కాల్ చేయండి.',

    navOverview: 'వివరాలు',
    navReport: 'నివేదించండి',
    navTrack: 'ట్రాక్ చేయండి',
    navStaffLogin: 'సిబ్బంది లాగిన్',
    navSignOut: 'లాగ్ అవుట్',

    queueDraftLocal: 'డ్రాఫ్ట్ స్థానికంగా భద్రపరచబడింది — పంపబడలేదు',
    queueSending: 'పంపబడుతోంది…',
    queueReceived: 'సర్వర్‌కు చేరింది',
    queueFailed: 'విఫలమైంది — పంపబడలేదు',
    queueOnline: '🟢 ఆన్‌లైన్',
    queueOffline: '🔴 ఆఫ్‌లైన్',
    queueClearDraft: '🗑️ డ్రాఫ్ట్ తొలగించు',

    reportHeading: 'అత్యవసర పరిస్థితిని నివేదించండి',
    reportEyebrow: 'ప్రజా వినతి / స్టేజ్ 11',
    reportSummaryHint:
      'గోదావరి కంట్రోల్ రూమ్‌కు నేరుగా అత్యవసర నివేదికను పంపండి. ఇంటర్నెట్ లేనప్పుడు డ్రాఫ్ట్ మీ ఫోన్‌లో సురక్షితంగా ఉంటుంది.',
    categoryLegend: 'అత్యవసర విభాగం *',
    shortDescLabel: 'సంఘటన సంక్షిప్త వివరణ *',
    shortDescHint:
      'ఏమి జరుగుతోంది, క్షతగాత్రుల సంఖ్య లేదా ప్రమాద తీవ్రతను తెలపండి (కనీసం 3 అక్షరాలు).',
    shortDescPlaceholder:
      'ఉదాహరణ: ఘాట్ మెట్ల వద్ద వృద్ధుడు కళ్ళు తిరిగి పడిపోయారు, శ్వాస ఆడుతోంది కానీ స్పృహ లేదు.',
    locationLegend: 'స్థలం మరియు ల్యాండ్‌మార్కులు *',
    locationHint: 'సమీపంలోని పుష్కర జోన్, ల్యాండ్‌మార్క్ లేదా GPS లొకేషన్‌ను పేర్కొనండి.',
    zoneLabel: 'పుష్కర జోన్',
    zoneHint: 'సమీపంలోని అధికారిక స్నానఘట్టం లేదా సెక్టార్‌ను ఎంచుకోండి.',
    zonePlaceholder: '-- సమీప పుష్కర జోన్ ఎంచుకోండి (ఐచ్ఛికం) --',
    landmarkLabel: 'ల్యాండ్‌మార్క్ లేదా ఖచ్చితమైన స్థలం *',
    landmarkHint: 'ఉదా: 4వ మెట్టు వద్ద, మంచినీటి స్టాల్ ఎదురుగా, పెద్ద రావిచెట్టు సమీపంలో.',
    landmarkPlaceholder: 'గుర్తుపట్టే స్తంభం నంబర్, ల్యాండ్‌మార్క్ లేదా సమీప దుకాణం వివరాలు…',
    gpsButton: 'డివైస్ GPS లొకేషన్ పంపండి',
    gpsAcquiring: 'GPS లొకేషన్ సేకరిస్తోంది…',
    gpsClear: 'GPS లొకేషన్ తొలగించు',
    confirmLocationLabel: 'ఈ సంఘటన స్థలాన్ని నేను ధృవీకరిస్తున్నాను',
    confirmLocationHint: 'పేర్కొన్న ప్రాంతంలోనే ప్రమాదం జరుగుతోందని నిర్ధారిస్తున్నాను.',
    callbackLabel: 'సంప్రదించాల్సిన ఫోన్ నంబర్ (ఐచ్ఛికం)',
    callbackHint:
      'అంతర్జాతీయ ఫార్మాట్ + తో ప్రారంభం (ఉదా: +919876543210). కేవలం అధికారిక సిబ్బందికి మాత్రమే కనిపిస్తుంది.',
    submitReportBtn: 'అత్యవసర నివేదికను పంపండి',
    transmittingBtn: 'నివేదిక పంపబడుతోంది…',
    emergencyCallBannerTitle: 'ప్రాణాపాయ పరిస్థితుల్లో: వెంటనే 112 కు కాల్ చేయండి',
    emergencyCallBannerText:
      'తక్షణ తరలింపు లేదా పోలీసు సహాయం అవసరమైతే ఫారమ్ స్పందనల కోసం వేచి ఉండకండి.',

    successTitle: 'అత్యవసర నివేదిక నమోదైంది',
    successSummary:
      'మీ నివేదిక కంట్రోల్ రూమ్ డేటాబేస్‌కు చేరింది. సిబ్బంది దీనిని తక్షణమే సమీక్షిస్తారు.',
    incidentIdLabel: 'నివేదిక ID',
    trackingTokenTitle: 'మీ ట్రాకింగ్ టోకెన్',
    trackingTokenHelp:
      'ఈ ప్రైవేట్ టోకెన్‌ను భద్రపరుచుకోండి. మీ గుర్తింపును వెల్లడించకుండా ప్రత్యక్ష పురోగతిని ట్రాక్ చేయడానికి ఇది ఉపయోగపడుతుంది.',
    copyTokenBtn: 'టోకెన్ కాపీ చేయండి',
    tokenCopied: 'కాపీ అయింది ✓',
    trackIncidentBtn: 'నివేదిక స్థితిని ట్రాక్ చేయండి →',
    submitAnotherBtn: 'మరొక నివేదిక పంపండి',

    trackHeading: 'అత్యవసర నివేదిక స్థితిని ట్రాక్ చేయండి',
    trackEyebrow: 'పబ్లిక్ ట్రాకింగ్ / స్టేజ్ 11',
    trackSummary:
      'మీ ప్రైవేట్ ట్రాకింగ్ కోడ్‌ని ఉపయోగించి గతంలో సమర్పించిన అత్యవసర నివేదిక యొక్క ప్రస్తుత స్థితిని తనిఖీ చేయండి.',
    trackTokenLabel: 'ట్రాకింగ్ టోకెన్ (32 అక్షరాల కోడ్)',
    trackTokenPlaceholder: 'మీ 32 అక్షరాల ట్రాకింగ్ టోకెన్‌ను ఇక్కడ నమోదు చేయండి…',
    checkStatusBtn: 'స్థితిని తనిఖీ చేయండి',
    checkingStatusBtn: 'తనిఖీ చేయబడుతోంది…',
    trackPrivacyNotice:
      'భద్రతా నిబంధనలు: రెస్పాండర్ల రక్షణ కోసం రేడియో ఛానెల్స్ మరియు ప్రత్యక్ష లొకేషన్ వివరాలు బహిర్గతం చేయబడవు. సంప్రదింపు వివరాలు కేవలం కంట్రోల్ రూమ్ ఆపరేటర్లకు మాత్రమే అందుబాటులో ఉంటాయి.',
    trackEscalationReminder:
      'పరిస్థితి విషమిస్తోందా? తక్షణ సహాయం కొరకు ట్రాకింగ్ అప్‌డేట్స్ కోసం వేచి ఉండకండి: వెంటనే 112 కు కాల్ చేయండి.',

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
    responderSub: 'అధికారిక ఫీల్డ్ రెస్పాండర్ల మొబైల్ వీక్షణ.',
    ackBtn: 'బాధ్యతను స్వీకరించండి',
    enRouteBtn: 'బయలుదేరినట్లు నమోదు చేయండి →',
    onSceneBtn: 'చేరుకున్నట్లు నమోదు చేయండి →',
    resolveBtn: 'పరిష్కరించినట్లు నమోదు చేయండి ✓',
    reqSupportBtn: 'అదనపు సహాయాన్ని కోరండి',
  },
};
