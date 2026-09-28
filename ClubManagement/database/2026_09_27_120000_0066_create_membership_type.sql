-- Baseline schema for dbo.Membership_type. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Membership_type', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Membership_type] (
        [membership_type_id] bigint IDENTITY(1,1) NOT NULL,
        [code] nvarchar(50) NOT NULL,
        [name] nvarchar(100) NOT NULL,
        [description] nvarchar(MAX) NULL,
        [sort_order] int NOT NULL CONSTRAINT [DF__Membershi__sort___5165187F] DEFAULT ((0)),
        [is_active] bit NOT NULL CONSTRAINT [DF__Membershi__is_ac__52593CB8] DEFAULT ((1)),
        [can_vote] bit NOT NULL CONSTRAINT [DF__Membershi__can_v__534D60F1] DEFAULT ((0)),
        [can_run_for_office] bit NOT NULL CONSTRAINT [DF__Membershi__can_r__5441852A] DEFAULT ((0)),
        [reciprocation_allowed] bit NOT NULL CONSTRAINT [DF__Membershi__recip__5535A963] DEFAULT ((0)),
        [can_introduce_guests] bit NOT NULL CONSTRAINT [DF__Membershi__can_i__5629CD9C] DEFAULT ((0)),
        [max_duration_days] int NULL,
        [is_permanent] bit NOT NULL CONSTRAINT [DF__Membershi__is_pe__571DF1D5] DEFAULT ((0)),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Membershi__creat__5812160E] DEFAULT (sysutcdatetime()),
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        [can_access_subscriptions] bit NOT NULL CONSTRAINT [DF_mt_subs] DEFAULT ((1)),
        [can_access_committee] bit NOT NULL CONSTRAINT [DF_mt_committee] DEFAULT ((1)),
        [can_access_accommodation] bit NOT NULL CONSTRAINT [DF_mt_accom] DEFAULT ((1)),
        [can_access_endorsements] bit NOT NULL CONSTRAINT [DF_mt_endorse] DEFAULT ((1)),
        [can_access_documents] bit NOT NULL CONSTRAINT [DF_mt_docs] DEFAULT ((1)),
        [tenant_id] bigint NOT NULL,
        CONSTRAINT [PK_Membership_type] PRIMARY KEY ([membership_type_id])
    );
END
GO
