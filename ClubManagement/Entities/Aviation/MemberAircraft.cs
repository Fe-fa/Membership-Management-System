using System;
using System.Collections.Generic;
using ClubManagement.Entities.Lookups;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClubManagement.Entities.Aviation
{
    [Table("Member_aircraft")]
    public class MemberAircraft
    {
        [Column("member_aircraft_id")]
        [Key]
        public long MemberAircraftId { get; set; }

        [Column("profile_id")]
        public long ProfileId { get; set; }

        [Column("aircraft_type_id")]
        public long AircraftTypeId { get; set; }

        [Column("registration_number")]
        [Required]
        public string RegistrationNumber { get; set; }

        [Column("country_of_registration")]
        public string? CountryOfRegistration { get; set; }

        [Column("hangar_location")]
        public string? HangarLocation { get; set; }

        [Column("is_co_owned")]
        public bool IsCoOwned { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("created_by_user_id")]
        public long? CreatedByUserId { get; set; }

        [Column("updated_by_user_id")]
        public long? UpdatedByUserId { get; set; }

        public virtual MProfile Profile { get; set; } = null!;

        public virtual AircraftType AircraftType { get; set; } = null!;

    }
}
