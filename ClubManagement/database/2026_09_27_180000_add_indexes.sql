-- Baseline indexes. This file is not executed by the application.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_account_type_code' AND t.name = N'Account_type' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_account_type_code] ON [dbo].[Account_type] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_affiliation_type_code' AND t.name = N'Affiliation_type' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_affiliation_type_code] ON [dbo].[Affiliation_type] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_aircraft_type_code' AND t.name = N'Aircraft_type' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_aircraft_type_code] ON [dbo].[Aircraft_type] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_application_status_code' AND t.name = N'Application_status' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_application_status_code] ON [dbo].[Application_status] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'IX_billing_document_status' AND t.name = N'Billing_document' AND s.name = N'dbo'
)
    CREATE INDEX [IX_billing_document_status] ON [dbo].[Billing_document] ([status], [kind], [fee_type]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'UX_billing_document_no' AND t.name = N'Billing_document' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [UX_billing_document_no] ON [dbo].[Billing_document] ([document_no]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_blood_group_code' AND t.name = N'blood_group' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_blood_group_code] ON [dbo].[blood_group] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_club_type_code' AND t.name = N'Club_type' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_club_type_code] ON [dbo].[Club_type] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'UQ_cbi_meeting_app' AND t.name = N'Committee_ballot_item' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [UQ_cbi_meeting_app] ON [dbo].[Committee_ballot_item] ([committee_meeting_id], [application_id]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'UQ_cbv_item_voter' AND t.name = N'Committee_ballot_vote' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [UQ_cbv_item_voter] ON [dbo].[Committee_ballot_vote] ([committee_ballot_item_id], [voter_profile_id]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_committee_role_code' AND t.name = N'Committee_role' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_committee_role_code] ON [dbo].[Committee_role] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_country_code' AND t.name = N'Country' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_country_code] ON [dbo].[Country] ([country_code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_disciplinary_action_type_code' AND t.name = N'Disciplinary_action_type' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_disciplinary_action_type_code] ON [dbo].[Disciplinary_action_type] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_document_type_code' AND t.name = N'Document_type' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_document_type_code] ON [dbo].[Document_type] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_election_type_code' AND t.name = N'Election_type' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_election_type_code] ON [dbo].[Election_type] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'IX_Endorsement_app_profile_status' AND t.name = N'Endorsement' AND s.name = N'dbo'
)
    CREATE INDEX [IX_Endorsement_app_profile_status] ON [dbo].[Endorsement] ([application_id], [endorser_profile_id], [status]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_fee_type_code' AND t.name = N'Fee_type' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_fee_type_code] ON [dbo].[Fee_type] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_gender_code' AND t.name = N'Gender' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_gender_code] ON [dbo].[Gender] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_governance_document_code' AND t.name = N'Governance_document' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_governance_document_code] ON [dbo].[Governance_document] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'IX_Guest_arrival_alert_pending' AND t.name = N'Guest_arrival_alert' AND s.name = N'dbo'
)
    CREATE INDEX [IX_Guest_arrival_alert_pending] ON [dbo].[Guest_arrival_alert] ([acknowledged_at], [created_at]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_guest_status_code' AND t.name = N'Guest_status' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_guest_status_code] ON [dbo].[Guest_status] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_license_type_code' AND t.name = N'License_type' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_license_type_code] ON [dbo].[License_type] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'UX_MAccount_membership_no_present' AND t.name = N'MAccount' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [UX_MAccount_membership_no_present] ON [dbo].[MAccount] ([tenant_id], [membership_no]) WHERE ([membership_no] IS NOT NULL);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_mapplication_application_no' AND t.name = N'MApplication' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_mapplication_application_no] ON [dbo].[MApplication] ([application_no]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_marital_status_code' AND t.name = N'Marital_status' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_marital_status_code] ON [dbo].[Marital_status] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_meeting_attendance' AND t.name = N'Meeting_attendance' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_meeting_attendance] ON [dbo].[Meeting_attendance] ([committee_meeting_id], [committee_member_id]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_meeting_type_code' AND t.name = N'Meeting_type' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_meeting_type_code] ON [dbo].[Meeting_type] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_member_status_code' AND t.name = N'Member_status' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_member_status_code] ON [dbo].[Member_status] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'UX_membership_invoice_account_year' AND t.name = N'Membership_invoice' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [UX_membership_invoice_account_year] ON [dbo].[Membership_invoice] ([account_id], [year]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'UX_membership_invoice_no' AND t.name = N'Membership_invoice' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [UX_membership_invoice_no] ON [dbo].[Membership_invoice] ([invoice_no]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_membership_type_code' AND t.name = N'Membership_type' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_membership_type_code] ON [dbo].[Membership_type] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'UX_MGuest_visit_slip_code' AND t.name = N'MGuest' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [UX_MGuest_visit_slip_code] ON [dbo].[MGuest] ([visit_slip_code]) WHERE ([visit_slip_code] IS NOT NULL);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_mprofile_membership_no' AND t.name = N'MProfile' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_mprofile_membership_no] ON [dbo].[MProfile] ([membership_no]) WHERE ([membership_no] IS NOT NULL);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_receipt_number' AND t.name = N'MReceiptMaster' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_receipt_number] ON [dbo].[MReceiptMaster] ([receipt_number]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_receipt_transaction' AND t.name = N'MReceiptMaster' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_receipt_transaction] ON [dbo].[MReceiptMaster] ([transaction_id]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_notification_type_code' AND t.name = N'Notification_type' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_notification_type_code] ON [dbo].[Notification_type] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_payment_method_code' AND t.name = N'Payment_method' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_payment_method_code] ON [dbo].[Payment_method] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_payment_status_code' AND t.name = N'Payment_status' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_payment_status_code] ON [dbo].[Payment_status] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_relationship_type_code' AND t.name = N'Relationship_type' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_relationship_type_code] ON [dbo].[Relationship_type] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_resolution_type_code' AND t.name = N'Resolution_type' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_resolution_type_code] ON [dbo].[Resolution_type] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'UX_reversal_source' AND t.name = N'Reversal_entry' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [UX_reversal_source] ON [dbo].[Reversal_entry] ([source_transaction_id]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_subscription_account_year' AND t.name = N'Subscription' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_subscription_account_year] ON [dbo].[Subscription] ([account_id], [subscription_year]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'IX_Support_ticket_category' AND t.name = N'Support_ticket' AND s.name = N'dbo'
)
    CREATE INDEX [IX_Support_ticket_category] ON [dbo].[Support_ticket] ([category_role_code], [status]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'UX_Support_ticket_no' AND t.name = N'Support_ticket' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [UX_Support_ticket_no] ON [dbo].[Support_ticket] ([ticket_no]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'UK_principal_name' AND t.name = N'sysdiagrams' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [UK_principal_name] ON [dbo].[sysdiagrams] ([principal_id], [name]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_system_role_code' AND t.name = N'System_role' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_system_role_code] ON [dbo].[System_role] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'UQ_tenant_code' AND t.name = N'Tenant' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [UQ_tenant_code] ON [dbo].[Tenant] ([code]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_user_account_profile' AND t.name = N'User_account' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_user_account_profile] ON [dbo].[User_account] ([profile_id]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_user_account_username' AND t.name = N'User_account' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_user_account_username] ON [dbo].[User_account] ([username]);
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.name = N'uq_user_role_assignment' AND t.name = N'User_role' AND s.name = N'dbo'
)
    CREATE UNIQUE INDEX [uq_user_role_assignment] ON [dbo].[User_role] ([user_account_id], [role_id]);
GO
