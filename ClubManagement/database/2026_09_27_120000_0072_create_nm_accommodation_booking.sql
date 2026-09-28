-- Baseline schema for dbo.Nm_accommodation_booking. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Nm_accommodation_booking', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Nm_accommodation_booking] (
        [nm_accommodation_booking_id] bigint IDENTITY(1,1) NOT NULL,
        [guest_name] nvarchar(200) NOT NULL,
        [phone] nvarchar(40) NULL,
        [email] nvarchar(200) NULL,
        [account_id] bigint NULL,
        [is_guest] bit NOT NULL CONSTRAINT [DF_nm_acc_is_guest] DEFAULT ((1)),
        [check_in_date] date NOT NULL,
        [check_out_date] date NOT NULL,
        [number_of_nights] int NOT NULL,
        [room_number] nvarchar(40) NULL,
        [nightly_rate] decimal(18,2) NOT NULL,
        [extra_charges] decimal(18,2) NOT NULL CONSTRAINT [DF_nm_acc_extra] DEFAULT ((0)),
        [total_amount] decimal(18,2) NOT NULL,
        [is_paid_in_advance] bit NOT NULL CONSTRAINT [DF_nm_acc_advance] DEFAULT ((0)),
        [status] nvarchar(40) NOT NULL,
        [receipt_no] nvarchar(40) NULL,
        [paid_at] datetime2(7) NULL,
        [payment_method] nvarchar(40) NULL,
        [reference_code] nvarchar(80) NULL,
        [created_at] datetime2(7) NOT NULL,
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [accommodation_booking_id] bigint NULL,
        CONSTRAINT [PK__Nm_accom__D44FE359709BDAD0] PRIMARY KEY ([nm_accommodation_booking_id])
    );
END
GO
