-- Baseline foreign keys. This file is not executed by the application.
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_accommodation_booking_account')
    ALTER TABLE [dbo].[Accommodation_booking] ADD CONSTRAINT [fk_accommodation_booking_account] FOREIGN KEY ([account_id]) REFERENCES [dbo].[MAccount] ([account_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_application_approval_application')
    ALTER TABLE [dbo].[Application_approval] ADD CONSTRAINT [fk_application_approval_application] FOREIGN KEY ([application_id]) REFERENCES [dbo].[MApplication] ([application_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_application_approval_profile')
    ALTER TABLE [dbo].[Application_approval] ADD CONSTRAINT [fk_application_approval_profile] FOREIGN KEY ([approver_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_application_approval_role')
    ALTER TABLE [dbo].[Application_approval] ADD CONSTRAINT [fk_application_approval_role] FOREIGN KEY ([approver_role_id]) REFERENCES [dbo].[Committee_role] ([committee_role_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Application_club_visit_app')
    ALTER TABLE [dbo].[Application_club_visit] ADD CONSTRAINT [FK_Application_club_visit_app] FOREIGN KEY ([application_id]) REFERENCES [dbo].[MApplication] ([application_id]) ON DELETE CASCADE;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_application_document_application')
    ALTER TABLE [dbo].[Aplication_document] ADD CONSTRAINT [fk_application_document_application] FOREIGN KEY ([application_id]) REFERENCES [dbo].[MApplication] ([application_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_application_document_doc_type')
    ALTER TABLE [dbo].[Aplication_document] ADD CONSTRAINT [fk_application_document_doc_type] FOREIGN KEY ([document_type_id]) REFERENCES [dbo].[Document_type] ([document_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_application_exclusion_application')
    ALTER TABLE [dbo].[ApplicationExclusion] ADD CONSTRAINT [fk_application_exclusion_application] FOREIGN KEY ([application_id]) REFERENCES [dbo].[MApplication] ([application_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_application_exclusion_profile')
    ALTER TABLE [dbo].[ApplicationExclusion] ADD CONSTRAINT [fk_application_exclusion_profile] FOREIGN KEY ([applicant_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_application_signature_application')
    ALTER TABLE [dbo].[Application_signature] ADD CONSTRAINT [fk_application_signature_application] FOREIGN KEY ([application_id]) REFERENCES [dbo].[MApplication] ([application_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_application_signature_profile')
    ALTER TABLE [dbo].[Application_signature] ADD CONSTRAINT [fk_application_signature_profile] FOREIGN KEY ([signatory_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_application_status_history_application')
    ALTER TABLE [dbo].[Application_status_history] ADD CONSTRAINT [fk_application_status_history_application] FOREIGN KEY ([application_id]) REFERENCES [dbo].[MApplication] ([application_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_application_status_history_from')
    ALTER TABLE [dbo].[Application_status_history] ADD CONSTRAINT [fk_application_status_history_from] FOREIGN KEY ([from_status_id]) REFERENCES [dbo].[Application_status] ([application_status_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_application_status_history_to')
    ALTER TABLE [dbo].[Application_status_history] ADD CONSTRAINT [fk_application_status_history_to] FOREIGN KEY ([to_status_id]) REFERENCES [dbo].[Application_status] ([application_status_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_arrears_account')
    ALTER TABLE [dbo].[Arrears] ADD CONSTRAINT [fk_arrears_account] FOREIGN KEY ([account_id]) REFERENCES [dbo].[MAccount] ([account_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_arrears_subscription')
    ALTER TABLE [dbo].[Arrears] ADD CONSTRAINT [fk_arrears_subscription] FOREIGN KEY ([subscription_id]) REFERENCES [dbo].[Subscription] ([subscription_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_arrears_transaction')
    ALTER TABLE [dbo].[Arrears] ADD CONSTRAINT [fk_arrears_transaction] FOREIGN KEY ([settled_by_transaction_id]) REFERENCES [dbo].[MTransaction] ([transaction_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_cbi_app')
    ALTER TABLE [dbo].[Committee_ballot_item] ADD CONSTRAINT [FK_cbi_app] FOREIGN KEY ([application_id]) REFERENCES [dbo].[MApplication] ([application_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_cbi_meeting')
    ALTER TABLE [dbo].[Committee_ballot_item] ADD CONSTRAINT [FK_cbi_meeting] FOREIGN KEY ([committee_meeting_id]) REFERENCES [dbo].[Committee_meeting] ([committee_meeting_id]) ON DELETE CASCADE;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_cbv_item')
    ALTER TABLE [dbo].[Committee_ballot_vote] ADD CONSTRAINT [FK_cbv_item] FOREIGN KEY ([committee_ballot_item_id]) REFERENCES [dbo].[Committee_ballot_item] ([committee_ballot_item_id]) ON DELETE CASCADE;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_cbv_voter')
    ALTER TABLE [dbo].[Committee_ballot_vote] ADD CONSTRAINT [FK_cbv_voter] FOREIGN KEY ([voter_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_club_club_type')
    ALTER TABLE [dbo].[Club] ADD CONSTRAINT [fk_club_club_type] FOREIGN KEY ([club_type_id]) REFERENCES [dbo].[Club_type] ([club_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_club_country')
    ALTER TABLE [dbo].[Club] ADD CONSTRAINT [fk_club_country] FOREIGN KEY ([country_id]) REFERENCES [dbo].[Country] ([country_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_club_setting_resolution')
    ALTER TABLE [dbo].[Club_setting] ADD CONSTRAINT [fk_club_setting_resolution] FOREIGN KEY ([authorizing_resolution_id]) REFERENCES [dbo].[Resolution] ([resolution_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_committee_meeting_chair')
    ALTER TABLE [dbo].[Committee_meeting] ADD CONSTRAINT [fk_committee_meeting_chair] FOREIGN KEY ([chair_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_committee_meeting_committee')
    ALTER TABLE [dbo].[Committee_meeting] ADD CONSTRAINT [fk_committee_meeting_committee] FOREIGN KEY ([committee_id]) REFERENCES [dbo].[Committee] ([committee_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_committee_meeting_type')
    ALTER TABLE [dbo].[Committee_meeting] ADD CONSTRAINT [fk_committee_meeting_type] FOREIGN KEY ([meeting_type_id]) REFERENCES [dbo].[Meeting_type] ([meeting_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_committee_member_committee')
    ALTER TABLE [dbo].[Committee_member] ADD CONSTRAINT [fk_committee_member_committee] FOREIGN KEY ([committee_id]) REFERENCES [dbo].[Committee] ([committee_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_committee_member_profile')
    ALTER TABLE [dbo].[Committee_member] ADD CONSTRAINT [fk_committee_member_profile] FOREIGN KEY ([profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_committee_member_role')
    ALTER TABLE [dbo].[Committee_member] ADD CONSTRAINT [fk_committee_member_role] FOREIGN KEY ([committee_role_id]) REFERENCES [dbo].[Committee_role] ([committee_role_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_complaint_profile')
    ALTER TABLE [dbo].[Complaint] ADD CONSTRAINT [fk_complaint_profile] FOREIGN KEY ([complainant_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_credit_facility_account')
    ALTER TABLE [dbo].[Credit_facility] ADD CONSTRAINT [fk_credit_facility_account] FOREIGN KEY ([account_id]) REFERENCES [dbo].[MAccount] ([account_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_credit_facility_profile')
    ALTER TABLE [dbo].[Credit_facility] ADD CONSTRAINT [fk_credit_facility_profile] FOREIGN KEY ([approved_by_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_data_sharing_consent_profile')
    ALTER TABLE [dbo].[Data_sharing_consent] ADD CONSTRAINT [fk_data_sharing_consent_profile] FOREIGN KEY ([profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_disciplinary_action_account')
    ALTER TABLE [dbo].[Disciplinary_action] ADD CONSTRAINT [fk_disciplinary_action_account] FOREIGN KEY ([account_id]) REFERENCES [dbo].[MAccount] ([account_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_disciplinary_action_approved_by')
    ALTER TABLE [dbo].[Disciplinary_action] ADD CONSTRAINT [fk_disciplinary_action_approved_by] FOREIGN KEY ([approved_by_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_disciplinary_action_meeting')
    ALTER TABLE [dbo].[Disciplinary_action] ADD CONSTRAINT [fk_disciplinary_action_meeting] FOREIGN KEY ([imposed_by_meeting_id]) REFERENCES [dbo].[Committee_meeting] ([committee_meeting_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_disciplinary_action_type')
    ALTER TABLE [dbo].[Disciplinary_action] ADD CONSTRAINT [fk_disciplinary_action_type] FOREIGN KEY ([action_type_id]) REFERENCES [dbo].[Disciplinary_action_type] ([disciplinary_action_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_endorsement_application')
    ALTER TABLE [dbo].[Endorsement] ADD CONSTRAINT [fk_endorsement_application] FOREIGN KEY ([application_id]) REFERENCES [dbo].[MApplication] ([application_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_endorsement_profile')
    ALTER TABLE [dbo].[Endorsement] ADD CONSTRAINT [fk_endorsement_profile] FOREIGN KEY ([endorser_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_enom_meeting')
    ALTER TABLE [dbo].[Election_nomination] ADD CONSTRAINT [FK_enom_meeting] FOREIGN KEY ([general_meeting_id]) REFERENCES [dbo].[General_meeting] ([general_meeting_id]) ON DELETE CASCADE;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_enom_nominee')
    ALTER TABLE [dbo].[Election_nomination] ADD CONSTRAINT [FK_enom_nominee] FOREIGN KEY ([nominee_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_enom_proposer')
    ALTER TABLE [dbo].[Election_nomination] ADD CONSTRAINT [FK_enom_proposer] FOREIGN KEY ([proposer_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_enom_seconder')
    ALTER TABLE [dbo].[Election_nomination] ADD CONSTRAINT [FK_enom_seconder] FOREIGN KEY ([seconder_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_fee_waiver_account')
    ALTER TABLE [dbo].[Fee_waiver] ADD CONSTRAINT [fk_fee_waiver_account] FOREIGN KEY ([account_id]) REFERENCES [dbo].[MAccount] ([account_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_fee_waiver_fee_type')
    ALTER TABLE [dbo].[Fee_waiver] ADD CONSTRAINT [fk_fee_waiver_fee_type] FOREIGN KEY ([fee_type_id]) REFERENCES [dbo].[Fee_type] ([fee_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_fee_waiver_parent_account')
    ALTER TABLE [dbo].[Fee_waiver] ADD CONSTRAINT [fk_fee_waiver_parent_account] FOREIGN KEY ([parent_account_id]) REFERENCES [dbo].[MAccount] ([account_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_general_meeting_adjourned_from')
    ALTER TABLE [dbo].[General_meeting] ADD CONSTRAINT [fk_general_meeting_adjourned_from] FOREIGN KEY ([adjourned_from_meeting_id]) REFERENCES [dbo].[General_meeting] ([general_meeting_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_general_meeting_chairman')
    ALTER TABLE [dbo].[General_meeting] ADD CONSTRAINT [fk_general_meeting_chairman] FOREIGN KEY ([chairman_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_gov_doc_ver_doc')
    ALTER TABLE [dbo].[Governance_document_version] ADD CONSTRAINT [fk_gov_doc_ver_doc] FOREIGN KEY ([governance_document_id]) REFERENCES [dbo].[Governance_document] ([governance_document_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_gov_doc_ver_superseded_by')
    ALTER TABLE [dbo].[Governance_document_version] ADD CONSTRAINT [fk_gov_doc_ver_superseded_by] FOREIGN KEY ([superseded_by_version_id]) REFERENCES [dbo].[Governance_document_version] ([governance_document_version_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_governance_document_current_version')
    ALTER TABLE [dbo].[Governance_document] ADD CONSTRAINT [fk_governance_document_current_version] FOREIGN KEY ([current_version_id]) REFERENCES [dbo].[Governance_document_version] ([governance_document_version_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_governance_document_type')
    ALTER TABLE [dbo].[Governance_document] ADD CONSTRAINT [fk_governance_document_type] FOREIGN KEY ([document_type_id]) REFERENCES [dbo].[Document_type] ([document_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Guest_arrival_alert_visit')
    ALTER TABLE [dbo].[Guest_arrival_alert] ADD CONSTRAINT [FK_Guest_arrival_alert_visit] FOREIGN KEY ([visit_id]) REFERENCES [dbo].[MVisit] ([visit_id]) ON DELETE CASCADE;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_interview_application')
    ALTER TABLE [dbo].[Interview] ADD CONSTRAINT [fk_interview_application] FOREIGN KEY ([application_id]) REFERENCES [dbo].[MApplication] ([application_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_interview_committee_meeting')
    ALTER TABLE [dbo].[Interview] ADD CONSTRAINT [fk_interview_committee_meeting] FOREIGN KEY ([committee_meeting_id]) REFERENCES [dbo].[Committee_meeting] ([committee_meeting_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_interview_interviewer')
    ALTER TABLE [dbo].[Interview] ADD CONSTRAINT [fk_interview_interviewer] FOREIGN KEY ([interviewer_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_maccount_application')
    ALTER TABLE [dbo].[MAccount] ADD CONSTRAINT [fk_maccount_application] FOREIGN KEY ([application_id]) REFERENCES [dbo].[MApplication] ([application_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_maccount_election_type')
    ALTER TABLE [dbo].[MAccount] ADD CONSTRAINT [fk_maccount_election_type] FOREIGN KEY ([election_type_id]) REFERENCES [dbo].[Election_type] ([election_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_maccount_member_status')
    ALTER TABLE [dbo].[MAccount] ADD CONSTRAINT [fk_maccount_member_status] FOREIGN KEY ([current_member_status_id]) REFERENCES [dbo].[Member_status] ([member_status_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_maccount_membership_type')
    ALTER TABLE [dbo].[MAccount] ADD CONSTRAINT [fk_maccount_membership_type] FOREIGN KEY ([membership_type_id]) REFERENCES [dbo].[Membership_type] ([membership_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_maccount_profile')
    ALTER TABLE [dbo].[MAccount] ADD CONSTRAINT [fk_maccount_profile] FOREIGN KEY ([profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mapplication_applicant')
    ALTER TABLE [dbo].[MApplication] ADD CONSTRAINT [fk_mapplication_applicant] FOREIGN KEY ([applicant_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mapplication_election_type')
    ALTER TABLE [dbo].[MApplication] ADD CONSTRAINT [fk_mapplication_election_type] FOREIGN KEY ([election_type_id]) REFERENCES [dbo].[Election_type] ([election_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mapplication_form_version')
    ALTER TABLE [dbo].[MApplication] ADD CONSTRAINT [fk_mapplication_form_version] FOREIGN KEY ([application_form_version_id]) REFERENCES [dbo].[Governance_document_version] ([governance_document_version_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mapplication_proposer')
    ALTER TABLE [dbo].[MApplication] ADD CONSTRAINT [fk_mapplication_proposer] FOREIGN KEY ([proposer_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mapplication_seconder')
    ALTER TABLE [dbo].[MApplication] ADD CONSTRAINT [fk_mapplication_seconder] FOREIGN KEY ([seconder_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mapplication_status')
    ALTER TABLE [dbo].[MApplication] ADD CONSTRAINT [fk_mapplication_status] FOREIGN KEY ([application_status_id]) REFERENCES [dbo].[Application_status] ([application_status_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mdependant_dependant_profile')
    ALTER TABLE [dbo].[MDependant] ADD CONSTRAINT [fk_mdependant_dependant_profile] FOREIGN KEY ([dependant_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mdependant_profile')
    ALTER TABLE [dbo].[MDependant] ADD CONSTRAINT [fk_mdependant_profile] FOREIGN KEY ([profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mdependant_relationship')
    ALTER TABLE [dbo].[MDependant] ADD CONSTRAINT [fk_mdependant_relationship] FOREIGN KEY ([relationship_type_id]) REFERENCES [dbo].[Relationship_type] ([relationship_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_meeting_agenda_item_meeting')
    ALTER TABLE [dbo].[Meeting_agenda_item] ADD CONSTRAINT [fk_meeting_agenda_item_meeting] FOREIGN KEY ([general_meeting_id]) REFERENCES [dbo].[General_meeting] ([general_meeting_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_meeting_agenda_item_resolution')
    ALTER TABLE [dbo].[Meeting_agenda_item] ADD CONSTRAINT [fk_meeting_agenda_item_resolution] FOREIGN KEY ([resolution_id]) REFERENCES [dbo].[Resolution] ([resolution_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_meeting_attendance_meeting')
    ALTER TABLE [dbo].[Meeting_attendance] ADD CONSTRAINT [fk_meeting_attendance_meeting] FOREIGN KEY ([committee_meeting_id]) REFERENCES [dbo].[Committee_meeting] ([committee_meeting_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_meeting_attendance_member')
    ALTER TABLE [dbo].[Meeting_attendance] ADD CONSTRAINT [fk_meeting_attendance_member] FOREIGN KEY ([committee_member_id]) REFERENCES [dbo].[Committee_member] ([committee_member_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_aircraft_profile')
    ALTER TABLE [dbo].[Member_aircraft] ADD CONSTRAINT [fk_member_aircraft_profile] FOREIGN KEY ([profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_aircraft_type')
    ALTER TABLE [dbo].[Member_aircraft] ADD CONSTRAINT [fk_member_aircraft_type] FOREIGN KEY ([aircraft_type_id]) REFERENCES [dbo].[Aircraft_type] ([aircraft_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_aviation_detail_profile')
    ALTER TABLE [dbo].[Member_aviation_detail] ADD CONSTRAINT [fk_member_aviation_detail_profile] FOREIGN KEY ([profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_club_affiliation_club')
    ALTER TABLE [dbo].[Member_club_affiliation] ADD CONSTRAINT [fk_member_club_affiliation_club] FOREIGN KEY ([club_id]) REFERENCES [dbo].[Club] ([club_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_club_affiliation_profile')
    ALTER TABLE [dbo].[Member_club_affiliation] ADD CONSTRAINT [fk_member_club_affiliation_profile] FOREIGN KEY ([profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_club_affiliation_type')
    ALTER TABLE [dbo].[Member_club_affiliation] ADD CONSTRAINT [fk_member_club_affiliation_type] FOREIGN KEY ([affiliation_type_id]) REFERENCES [dbo].[Affiliation_type] ([affiliation_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_emergency_contact_profile')
    ALTER TABLE [dbo].[Member_emergency_contact] ADD CONSTRAINT [fk_member_emergency_contact_profile] FOREIGN KEY ([profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_emergency_contact_relationship')
    ALTER TABLE [dbo].[Member_emergency_contact] ADD CONSTRAINT [fk_member_emergency_contact_relationship] FOREIGN KEY ([relationship_type_id]) REFERENCES [dbo].[Relationship_type] ([relationship_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_guarantorship_profile')
    ALTER TABLE [dbo].[Member_guarantorship] ADD CONSTRAINT [fk_member_guarantorship_profile] FOREIGN KEY ([guarantor_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_guarantorship_temp_account')
    ALTER TABLE [dbo].[Member_guarantorship] ADD CONSTRAINT [fk_member_guarantorship_temp_account] FOREIGN KEY ([temporary_account_id]) REFERENCES [dbo].[MAccount] ([account_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_license_profile')
    ALTER TABLE [dbo].[Member_license] ADD CONSTRAINT [fk_member_license_profile] FOREIGN KEY ([profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_license_type')
    ALTER TABLE [dbo].[Member_license] ADD CONSTRAINT [fk_member_license_type] FOREIGN KEY ([license_type_id]) REFERENCES [dbo].[License_type] ([license_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_status_history_account')
    ALTER TABLE [dbo].[Member_status_history] ADD CONSTRAINT [fk_member_status_history_account] FOREIGN KEY ([account_id]) REFERENCES [dbo].[MAccount] ([account_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_status_history_from')
    ALTER TABLE [dbo].[Member_status_history] ADD CONSTRAINT [fk_member_status_history_from] FOREIGN KEY ([from_status_id]) REFERENCES [dbo].[Member_status] ([member_status_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_status_history_to')
    ALTER TABLE [dbo].[Member_status_history] ADD CONSTRAINT [fk_member_status_history_to] FOREIGN KEY ([to_status_id]) REFERENCES [dbo].[Member_status] ([member_status_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_status_override_account')
    ALTER TABLE [dbo].[Member_status_override] ADD CONSTRAINT [fk_member_status_override_account] FOREIGN KEY ([account_id]) REFERENCES [dbo].[MAccount] ([account_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_status_override_profile')
    ALTER TABLE [dbo].[Member_status_override] ADD CONSTRAINT [fk_member_status_override_profile] FOREIGN KEY ([approved_by_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_vote_agenda_item')
    ALTER TABLE [dbo].[Member_vote] ADD CONSTRAINT [fk_member_vote_agenda_item] FOREIGN KEY ([general_meeting_business_item_id]) REFERENCES [dbo].[Meeting_agenda_item] ([meeting_agenda_item_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_vote_meeting')
    ALTER TABLE [dbo].[Member_vote] ADD CONSTRAINT [fk_member_vote_meeting] FOREIGN KEY ([general_meeting_id]) REFERENCES [dbo].[General_meeting] ([general_meeting_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_vote_proxy')
    ALTER TABLE [dbo].[Member_vote] ADD CONSTRAINT [fk_member_vote_proxy] FOREIGN KEY ([cast_via_proxy_id]) REFERENCES [dbo].[Proxy] ([proxy_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_member_vote_voter')
    ALTER TABLE [dbo].[Member_vote] ADD CONSTRAINT [fk_member_vote_voter] FOREIGN KEY ([voter_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mguest_guest_profile')
    ALTER TABLE [dbo].[MGuest] ADD CONSTRAINT [fk_mguest_guest_profile] FOREIGN KEY ([guest_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mguest_introduced_by')
    ALTER TABLE [dbo].[MGuest] ADD CONSTRAINT [fk_mguest_introduced_by] FOREIGN KEY ([introduced_by_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mguest_status')
    ALTER TABLE [dbo].[MGuest] ADD CONSTRAINT [fk_mguest_status] FOREIGN KEY ([guest_status_id]) REFERENCES [dbo].[Guest_status] ([guest_status_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mprofile_account_type')
    ALTER TABLE [dbo].[MProfile] ADD CONSTRAINT [fk_mprofile_account_type] FOREIGN KEY ([account_type_id]) REFERENCES [dbo].[Account_type] ([account_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mprofile_blood_group')
    ALTER TABLE [dbo].[MProfile] ADD CONSTRAINT [fk_mprofile_blood_group] FOREIGN KEY ([blood_group_id]) REFERENCES [dbo].[blood_group] ([blood_group_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mprofile_country')
    ALTER TABLE [dbo].[MProfile] ADD CONSTRAINT [fk_mprofile_country] FOREIGN KEY ([country_id]) REFERENCES [dbo].[Country] ([country_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mprofile_country_of_residence')
    ALTER TABLE [dbo].[MProfile] ADD CONSTRAINT [fk_mprofile_country_of_residence] FOREIGN KEY ([country_of_residence_id]) REFERENCES [dbo].[Country] ([country_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mprofile_gender')
    ALTER TABLE [dbo].[MProfile] ADD CONSTRAINT [fk_mprofile_gender] FOREIGN KEY ([gender_id]) REFERENCES [dbo].[Gender] ([gender_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mprofile_marital_status')
    ALTER TABLE [dbo].[MProfile] ADD CONSTRAINT [fk_mprofile_marital_status] FOREIGN KEY ([marital_status_id]) REFERENCES [dbo].[Marital_status] ([marital_status_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mprofile_nationality')
    ALTER TABLE [dbo].[MProfile] ADD CONSTRAINT [fk_mprofile_nationality] FOREIGN KEY ([nationality_id]) REFERENCES [dbo].[Country] ([country_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mtransaction_account')
    ALTER TABLE [dbo].[MTransaction] ADD CONSTRAINT [fk_mtransaction_account] FOREIGN KEY ([account_id]) REFERENCES [dbo].[MAccount] ([account_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mtransaction_fee_type')
    ALTER TABLE [dbo].[MTransaction] ADD CONSTRAINT [fk_mtransaction_fee_type] FOREIGN KEY ([fee_type_id]) REFERENCES [dbo].[Fee_type] ([fee_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mtransaction_payment_method')
    ALTER TABLE [dbo].[MTransaction] ADD CONSTRAINT [fk_mtransaction_payment_method] FOREIGN KEY ([payment_method_id]) REFERENCES [dbo].[Payment_method] ([payment_method_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mtransaction_payment_status')
    ALTER TABLE [dbo].[MTransaction] ADD CONSTRAINT [fk_mtransaction_payment_status] FOREIGN KEY ([payment_status_id]) REFERENCES [dbo].[Payment_status] ([payment_status_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mtransaction_profile')
    ALTER TABLE [dbo].[MTransaction] ADD CONSTRAINT [fk_mtransaction_profile] FOREIGN KEY ([profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mtransaction_receipt')
    ALTER TABLE [dbo].[MTransaction] ADD CONSTRAINT [fk_mtransaction_receipt] FOREIGN KEY ([receipt_id]) REFERENCES [dbo].[MReceiptMaster] ([receipt_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mtransaction_subscription')
    ALTER TABLE [dbo].[MTransaction] ADD CONSTRAINT [fk_mtransaction_subscription] FOREIGN KEY ([subscription_id]) REFERENCES [dbo].[Subscription] ([subscription_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mvisit_guest')
    ALTER TABLE [dbo].[MVisit] ADD CONSTRAINT [fk_mvisit_guest] FOREIGN KEY ([guest_id]) REFERENCES [dbo].[MGuest] ([guest_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_mvisit_visiting_profile')
    ALTER TABLE [dbo].[MVisit] ADD CONSTRAINT [fk_mvisit_visiting_profile] FOREIGN KEY ([visiting_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_nm_custom_line_charge')
    ALTER TABLE [dbo].[Nm_custom_charge_line] ADD CONSTRAINT [FK_nm_custom_line_charge] FOREIGN KEY ([nm_custom_charge_id]) REFERENCES [dbo].[Nm_custom_charge] ([nm_custom_charge_id]) ON DELETE CASCADE;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_notification_account')
    ALTER TABLE [dbo].[Notification] ADD CONSTRAINT [fk_notification_account] FOREIGN KEY ([account_id]) REFERENCES [dbo].[MAccount] ([account_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_notification_type')
    ALTER TABLE [dbo].[Notification] ADD CONSTRAINT [fk_notification_type] FOREIGN KEY ([notification_type_id]) REFERENCES [dbo].[Notification_type] ([notification_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_proxy_appointing_profile')
    ALTER TABLE [dbo].[Proxy] ADD CONSTRAINT [fk_proxy_appointing_profile] FOREIGN KEY ([appointing_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_proxy_meeting')
    ALTER TABLE [dbo].[Proxy] ADD CONSTRAINT [fk_proxy_meeting] FOREIGN KEY ([general_meeting_id]) REFERENCES [dbo].[General_meeting] ([general_meeting_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_proxy_proxy_profile')
    ALTER TABLE [dbo].[Proxy] ADD CONSTRAINT [fk_proxy_proxy_profile] FOREIGN KEY ([proxy_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_receipt_transaction')
    ALTER TABLE [dbo].[MReceiptMaster] ADD CONSTRAINT [fk_receipt_transaction] FOREIGN KEY ([transaction_id]) REFERENCES [dbo].[MTransaction] ([transaction_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_reciprocal_usage_club')
    ALTER TABLE [dbo].[Reciprocal_usage] ADD CONSTRAINT [fk_reciprocal_usage_club] FOREIGN KEY ([home_club_id]) REFERENCES [dbo].[Club] ([club_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_reciprocal_usage_profile')
    ALTER TABLE [dbo].[Reciprocal_usage] ADD CONSTRAINT [fk_reciprocal_usage_profile] FOREIGN KEY ([profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_reinstatement_account')
    ALTER TABLE [dbo].[Reinstatement] ADD CONSTRAINT [fk_reinstatement_account] FOREIGN KEY ([account_id]) REFERENCES [dbo].[MAccount] ([account_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_reinstatement_approved_by')
    ALTER TABLE [dbo].[Reinstatement] ADD CONSTRAINT [fk_reinstatement_approved_by] FOREIGN KEY ([approved_by_profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_reinstatement_disciplinary_action')
    ALTER TABLE [dbo].[Reinstatement] ADD CONSTRAINT [fk_reinstatement_disciplinary_action] FOREIGN KEY ([disciplinary_action_id]) REFERENCES [dbo].[Disciplinary_action] ([disciplinary_action_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_reinstatement_reapplication')
    ALTER TABLE [dbo].[Reinstatement] ADD CONSTRAINT [fk_reinstatement_reapplication] FOREIGN KEY ([reapplication_id]) REFERENCES [dbo].[MApplication] ([application_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_resolution_meeting')
    ALTER TABLE [dbo].[Resolution] ADD CONSTRAINT [fk_resolution_meeting] FOREIGN KEY ([committee_meeting_id]) REFERENCES [dbo].[Committee_meeting] ([committee_meeting_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_resolution_type')
    ALTER TABLE [dbo].[Resolution] ADD CONSTRAINT [fk_resolution_type] FOREIGN KEY ([resolution_type_id]) REFERENCES [dbo].[Resolution_type] ([resolution_type_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_subscription_account')
    ALTER TABLE [dbo].[Subscription] ADD CONSTRAINT [fk_subscription_account] FOREIGN KEY ([account_id]) REFERENCES [dbo].[MAccount] ([account_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_subscription_status')
    ALTER TABLE [dbo].[Subscription] ADD CONSTRAINT [fk_subscription_status] FOREIGN KEY ([subscription_status_id]) REFERENCES [dbo].[Member_status] ([member_status_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_support_msg_ticket')
    ALTER TABLE [dbo].[Support_ticket_message] ADD CONSTRAINT [FK_support_msg_ticket] FOREIGN KEY ([support_ticket_id]) REFERENCES [dbo].[Support_ticket] ([support_ticket_id]) ON DELETE CASCADE;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_user_account_profile')
    ALTER TABLE [dbo].[User_account] ADD CONSTRAINT [fk_user_account_profile] FOREIGN KEY ([profile_id]) REFERENCES [dbo].[MProfile] ([profile_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_user_role_account')
    ALTER TABLE [dbo].[User_role] ADD CONSTRAINT [fk_user_role_account] FOREIGN KEY ([user_account_id]) REFERENCES [dbo].[User_account] ([user_account_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_user_role_role')
    ALTER TABLE [dbo].[User_role] ADD CONSTRAINT [fk_user_role_role] FOREIGN KEY ([role_id]) REFERENCES [dbo].[System_role] ([system_role_id]);
GO
